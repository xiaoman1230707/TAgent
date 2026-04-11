import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Runnable } from '@langchain/core/runnables';
import {
    BaseMessage,
    AIMessage,
    SystemMessage,
    HumanMessage,
    ToolMessage,
    AIMessageChunk,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { StructuredTool } from '@langchain/core/tools';// 结构化的tool 名字 描述 schema 函数功能
import { SessionService } from '../session/session.service';


@Injectable()
export class AiService {
    // Runable 是langchain中的一个接口 表示可运行的对象
    // BaseMessage[] 是langchain 中的一个基类 表示一个消息数组 传什么都符合
    // AI Human ToolMessage 是langchain中的子类 表示一个消息
    // 输入的类型约束 BaseMessage[] 输出的类型约束 AIMessage
    private readonly modelWithTools:Runnable<BaseMessage[],AIMessage>;
    // 将llm和业务逻辑分离
    // 注入了 provide 的model
    constructor(
        @Inject('CHAT_MODEL') model:ChatOpenAI,
        @Inject('QUERY_USER_TOOL') private readonly queryUserTool:StructuredTool,
        @Inject('SEND_MAIL_TOOL') private readonly sendMailTool:StructuredTool,
        @Inject('WEB_SEARCH_TOOL') private readonly websearchTool:StructuredTool,
        private readonly sessionService: SessionService,
    ){
        this.modelWithTools = model.bindTools([
            this.queryUserTool,
            this.sendMailTool,
            this.websearchTool,
        ]);
    }
  

    // 流式调用 llm 边生成边返回
    // generator 生成器函数
    async *runChainStream(query:string, sessionId: string): AsyncIterable<string>{
        const session = this.sessionService.findById(sessionId);
        if (!session) {
            throw new NotFoundException(`Session with id "${sessionId}" not found`);
        }

        // 使用 session 的消息历史，如果没有则使用系统消息初始化
        const messages : BaseMessage[] = session.messages.length > 0
            ? [...session.messages]
            : [new SystemMessage(`你是一个智能助手，可以再需要时调用工具(如query_user)来查询用户信息，再用结果回答用户的问题`)];

        // 添加用户查询到消息历史和 session
        const humanMessage = new HumanMessage(query);
        messages.push(humanMessage);
        this.sessionService.addMessage(sessionId, humanMessage);
        // agent loop
        while(true){
            // 流式生成
            const stream = await this.modelWithTools.stream(messages);
            let fullAIMessage : AIMessageChunk | null = null;
            // as 类型断言 异步的 可迭代 chunk
            for await (const chunk of stream as AsyncIterable<AIMessageChunk>){
                fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;
                // 是否存在工具调用
                const hasToolCallChunk = !!fullAIMessage.tool_call_chunks && 
                    fullAIMessage.tool_call_chunks.length > 0;
                if(!hasToolCallChunk && chunk.content){
                    yield chunk.content as string;
                }
            }
            if(!fullAIMessage){
                return ;
            }
            // stream，有chunk且不是tool调用，那就yield直接返回
            // stream 结束，同时 也是一条完整的AImessage
            messages.push(fullAIMessage)
            // 保存 AI 消息到 session
            this.sessionService.addMessage(sessionId, fullAIMessage);
            // ？？ 空值合并运算符 如果 fullAIMessage.tool_calls 为空，就返回一个空数组
            const toolCalls = fullAIMessage.tool_calls ?? [];
            if(!toolCalls.length){
                return ;
            }
        for (const toolCall of toolCalls) {
            const toolCallId = toolCall.id || '';
            const toolName = toolCall.name;
            if (toolName === 'query_user') {
                const result = await this.queryUserTool.invoke(toolCall.args);
                messages.push(
                    new ToolMessage({
                        content: result,
                        name: toolName,
                        tool_call_id: toolCallId,
                    })
                )
            }else if(toolName === 'send_mail'){
                const result = await this.sendMailTool.invoke(toolCall.args);
                messages.push(
                    new ToolMessage({
                        content: result,
                        name: toolName,
                        tool_call_id: toolCallId,
                    })
                )
            }else if(toolName === 'web_search'){
                const result = await this.websearchTool.invoke(toolCall.args);
                messages.push(
                    new ToolMessage({
                        content: result,
                        name: toolName,
                        tool_call_id: toolCallId,
                    })
                )
            }
        }
        }
    }
    // 同步调用 llm 完全生成后再返回
    // async runChain(query:string):Promise<string>{

    // }
}