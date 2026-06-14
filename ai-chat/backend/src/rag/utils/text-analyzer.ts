/**
 * 文本分析工具
 * 用于从小说片段中提取元数据（章节名、人物等）
 */

// 《天龙八部》主要人物列表
const MAIN_CHARACTERS = [
  // 主角三人组
  '段誉', '乔峰', '萧峰', '虚竹',
  // 段誉相关
  '王语嫣', '木婉清', '钟灵', '段正淳', '刀白凤', '段延庆', '南海鳄神', '云中鹤',
  // 乔峰相关
  '阿朱', '阿紫', '康敏', '马大元', '白世镜', '全冠清', '徐长老', '吴长风',
  '玄慈', '玄苦', '玄难', '玄痛', '玄寂', '玄生',
  // 虚竹相关
  '天山童姥', '李秋水', '梦姑', '银川公主', '苏星河', '丁春秋', '函谷八友',
  // 慕容家
  '慕容复', '慕容博', '王夫人', '李青萝', '邓百川', '公冶乾', '风波恶', '包不同',
  // 逍遥派
  '无崖子', '李沧海',
  // 大理段氏
  '段正明', '高升泰', '巴天石', '华赫艮', '范晔', '褚万里', '古笃诚', '傅思归', '朱丹臣',
  // 丐帮
  '陈长老', '宋长老', '奚长老', '吴长老', '陈孤雁',
  // 少林
  '扫地僧', '灵门', '灵玄', '慧真', '慧观', '慧净', '虚清', '虚湛', '虚渊',
  // 吐蕃
  '鸠摩智', '桑结', '大轮明王',
  // 西夏
  '赫连铁树', '李延宗',
  // 其他
  '游坦之', '聚贤庄', '谭公', '谭婆', '赵钱孙', '单正', '阮星竹', '甘宝宝', '秦红棉',
  '马五德', '左子穆', '龚光杰', '容子矩', '干光豪', '葛光佩', '辛双清', '司空玄',
  '不平道人', '芙蓉仙子', '剑神卓不凡', '乌老大', '桑土公', '玄黄子', '章达夫',
  '耶律洪基', '耶律重元', '楚王', '萧远山',
];

/**
 * 从文本中提取章节名
 * 匹配模式：第X章 XXX 或 第X回 XXX
 * @param content 文本内容
 * @param chapterNum 章节号（用于备选）
 * @returns 章节名
 */
export function extractChapterName(content: string, chapterNum?: number): string {
  // 尝试匹配 "第X章 XXX" 或 "第X回 XXX"
  const chapterPattern = /第[一二三四五六七八九十百千零\d]+[章回]\s*([^\n]+)/;
  const match = content.match(chapterPattern);

  if (match && match[1]) {
    return match[1].trim();
  }

  // 如果无法提取，返回默认值
  return chapterNum ? `第${chapterNum}章` : '未知章节';
}

/**
 * 从文本中提取出现的人物
 * @param content 文本内容
 * @returns 人物列表（按出现频率排序）
 */
export function extractCharacters(content: string): string[] {
  const foundCharacters: Map<string, number> = new Map();

  // 遍历人物列表进行匹配
  for (const character of MAIN_CHARACTERS) {
    // 处理乔峰/萧峰是同一个人的情况
    const searchName = character === '乔峰' ? '萧峰' : character;
    const regex = new RegExp(searchName, 'g');
    const matches = content.match(regex);

    if (matches && matches.length > 0) {
      // 萧峰和乔峰视为同一人，统一用"乔峰"
      const normalizedName = character === '萧峰' ? '乔峰' : character;
      foundCharacters.set(normalizedName, matches.length);
    }
  }

  // 按出现频率排序，返回前5个
  return Array.from(foundCharacters.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
}

/**
 * 提取文本摘要/高亮片段
 * 根据关键词定位相关内容，提取前后文
 * @param content 原文
 * @param keywords 关键词列表
 * @param maxLength 最大长度
 * @returns 摘要文本
 */
export function extractExcerpt(
  content: string,
  keywords: string[],
  maxLength: number = 200,
): string {
  if (content.length <= maxLength) {
    return content;
  }

  // 如果没有关键词，返回开头
  if (keywords.length === 0) {
    return content.substring(0, maxLength) + '...';
  }

  // 查找第一个关键词出现的位置
  let bestPosition = -1;
  for (const keyword of keywords) {
    const pos = content.indexOf(keyword);
    if (pos !== -1) {
      bestPosition = pos;
      break;
    }
  }

  // 如果没找到关键词，返回开头
  if (bestPosition === -1) {
    return content.substring(0, maxLength) + '...';
  }

  // 计算截取范围（关键词前后各一半长度）
  const halfLength = Math.floor(maxLength / 2);
  let start = Math.max(0, bestPosition - halfLength);
  let end = Math.min(content.length, bestPosition + halfLength);

  // 调整以确保截取 maxLength 个字符
  if (end - start < maxLength && end < content.length) {
    end = Math.min(content.length, start + maxLength);
  }

  let excerpt = content.substring(start, end);

  // 添加省略号
  if (start > 0) excerpt = '...' + excerpt;
  if (end < content.length) excerpt = excerpt + '...';

  return excerpt;
}

/**
 * 分词提取关键词（简单实现）
 * 去除停用词，返回有意义的关键词
 * @param text 输入文本
 * @returns 关键词列表
 */
export function extractKeywords(text: string): string[] {
  // 简单停用词列表
  const stopWords = new Set([
    '的', '了', '是', '我', '你', '他', '她', '它', '们', '这', '那',
    '有', '在', '和', '就', '不', '人', '都', '一', '一个', '上', '也',
    '很', '到', '说', '要', '去', '可以', '会', '对', '能', '而', '及',
    '与', '或', '但', '如果', '因为', '所以', '虽然', '而且',
  ]);

  // 简单的分词（按非中文字符分割）
  const words = text.split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/);

  return words
    .filter((word) => word.length >= 2 && !stopWords.has(word))
    .slice(0, 5);
}
