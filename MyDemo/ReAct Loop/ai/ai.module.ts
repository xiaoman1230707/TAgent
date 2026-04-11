import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { MailerService } from '@nestjs-modules/mailer';
import { response } from 'express';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  controllers: [AiController],
  providers: [AiService,UserService,
    // 动态创建的provide 
    // 这个provide 将model从逻辑中剥离出来 
    // llm作为provide提供 
    {
      provide:"CHAT_MODEL",
      // 工厂模式， 平时生产车 战时就生产坦克...
      useFactory:(configService:ConfigService)=>{
        return new ChatOpenAI({
          apiKey:configService.get("OPENAI_API_KEY"),
          configuration:{
            baseURL:configService.get("OPENAI_BASE_URL"),
          },
          model:configService.get("OPENAI_MODEL_NAME"),
        })
      },
      inject:[ConfigService]
    },
    {
        provide: 'QUERY_USER_TOOL',
        useFactory: (userService: UserService) => {
            const queryUserArgsSchema = z.object({
                userId: z.string().describe('用户ID,例如： 001， 002， 003')
            });
            return tool(
                async ({userId}: {userId: string}) => {
                    const user = userService.findOne(userId);
                    if (!user) {
                        const availableIds = userService
                            .findAll()
                            .map(u => u.id)
                            .join(', ');
                        return `用户${userId}不存在。可用的ID: ${availableIds}`
                    }
                    return `用户信息：\n- ID: ${user.id} \n- 姓名：${user.name}
                    \n- 邮箱: ${user.email}\n- 角色 ${user.role}
                    `
                },
                {
                    name: 'query_user',
                    description: `查询数据库中的用户信息。输入用户ID，
                    返回该用户的详细信息（姓名、邮箱、角色）`,
                    schema: queryUserArgsSchema
                }
            )
        },
        inject: [UserService]
    },
    {
        provide: 'SEND_MAIL_TOOL',
        useFactory:(mailerService:MailerService,configService:ConfigService)=>{
            // zod 是大模型tool工作的工程化保障之一
            const sendMailArgsSchema = z.object({
                to: z.email().describe('收件人邮箱地址，例如：user@example.com'),
                subject: z.string().describe('邮件主题'),
                text: z.string().describe('纯文本内容，可选'),
                html: z.string().describe('HTML内容，可选'),
            });
            return tool(
                async({to,subject,text,html}:{
                        to:string,
                        subject:string,
                        text?:string,
                        html?:string,
                })=>{
                    const fallbackFrom = configService.get<string>('MAIL_FROM');
                    await mailerService.sendMail({
                        from: fallbackFrom,
                        to,
                        subject,
                        // 空值合并运算符
                        text:text ?? ("无文本内容"),
                        html:html ?? `<p>${text ?? ("无HTML内容")}</p>`,
                    });
                    return `邮件发送成功，收件人：${to}，主题：${subject}`;
                },
                {
                    name: 'send_mail',
                    description: `发送电子邮件。需要提供收件人邮箱、主题、可选文本内容和HTML内容  
                    返回发送结果`,
                    schema: sendMailArgsSchema
                }
            );
        },
        inject:[MailerService,ConfigService]
    },
    {
        provide: "WEB_SEARCH_TOOL",
        useFactory: (configService:ConfigService)=>{
            const webSearchArgsSchema = z.object({
                query: z.string().min(1).describe('搜索关键词，例如： 公司年报，某个时间等'),
                count :z.number().int().min(1).max(20).optional().describe("返回的结果数量，默认10条")
            });
            return tool(
                async ({query,count}: {query: string ; count?:number}) => {
                   const apiKey = configService.get("BOCHA_API_KEY");
                   if(!apiKey){
                    return "BOCHA API_KEY 未配置";
                   }
                   const url = 'http://api.bochaai.com/v1/web-search';
                   const body = {
                    query,
                    freshness:'noLimit',// 不限制刷新
                    summary:true, // 总结一下
                    count : count ?? 10
                   };
                   const response = await fetch(url,{
                    method:'POST',
                    headers:{
                        'Authorization':`Bearer ${apiKey}`,
                        'Content-Type':'application/json',
                    },
                    body:JSON.stringify(body),
                   });
                   if(!response.ok){
                    const errorText = await response.text();
                    return `搜索API 请求失败，状态码：${response.status}， 错误信息：${errorText}`;
                   }
                   let json :any;
                    try {
                        if (json.code !== 200 || !json.data) {
                            return `搜索 API 请求失败，原因是: ${json.msg ?? '未知错误'}`;
                        }
                        const webpages = json.data.webPages?.value ?? [];
                        if (!webpages.length) {
                            return '未找到相关结果。';
                        }

                        const formatted = webpages
                            .map(
                                (page: any, idx: number) =>
                                    `引用: ${idx + 1}
                                标题: ${page.name}
                                URL: ${page.url}
                                摘要: ${page.summary}
                                网站名称: ${page.siteName}
                                网站图标: ${page.siteIcon}
                                发布时间: ${page.dateLastCrawled}`,
                            )
                            .join('\n\n');

                        return formatted;
                    } catch (e) {
                        return `搜索 API 请求失败，原因是：搜索结果解析失败 ${(e as Error).message}`;
                    }
                },
                {
                    name: 'web_search',
                    description: `使用BOCHA API 搜索互联网网页。输入为搜索关键词(可选count 指定结果数量)
                    ，返回包含标题URL，摘要，网站名称，图标和时间等信息的结果列表`,
                    schema: webSearchArgsSchema
                }
            )
        },
        inject:[ConfigService]
    }
  ],
})
export class AiModule {}
