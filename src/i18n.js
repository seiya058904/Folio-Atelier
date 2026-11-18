// Interface language. English is the source: `t("Some words")` returns the
// same words in English and looks them up in the dictionary below for Chinese.
// Placeholders are written `{name}`. Text the user typed is never translated.

const STORAGE_KEY = "folio-atelier-lang";

const ZH = {
  /* ----- shell ----- */
  "A personal 3D bookmaking studio": "个人 3D 制书工坊",
  "An empty shelf": "书架还空着",
  "Your shelf is empty": "你的书架还空着",
  "Craft a book that is<br><em>entirely yours.</em>": "亲手做一本<br><em>完全属于你的书。</em>",
  "Choose a cloth, press a title in foil, set the pages inside — then open it and turn them. Every book you make is kept here.":
    "选一块书布，烫上书名，排好内页——然后翻开它，一页页读下去。你做的每一本书，都会留在这里。",
  "Create your first book": "制作你的第一本书",
  "Import a .folio file": "导入 .folio 文件",
  "Duplicate": "复制",
  "Export": "导出",
  "Delete": "删除",
  "Open": "打开",
  "Import": "导入",
  "New book": "新书",
  "Previous book": "上一本",
  "Next book": "下一本",
  "Your shelf": "你的书架",
  "Library": "书库",
  "Choose a book": "选择一本书",
  "Book studio": "制书工坊",
  "Return book to the shelf": "把书放回书架",
  "Undo": "撤销",
  "Redo": "重做",
  "Parts of the book": "书的各部分",
  "Reading controls": "阅读控制",
  "Previous page": "上一页",
  "Next page": "下一页",
  "Reset view": "重置视角",
  "Open book": "翻开",
  "Close book": "合上",
  "A new volume": "新的一册",
  "Begin a book": "开始一本书",
  "Cancel": "取消",
  "Title": "书名",
  "Author": "作者",
  "Untitled": "未命名",
  "Your name": "你的名字",
  "Start from a binding — everything can be changed later": "选一种装帧起步——之后都可以再改",
  "Starting binding": "起始装帧",
  "Create book": "创建",
  "Delete this book?": "删除这本书？",
  "Keep it": "保留",
  "Delete book": "删除",
  "The atelier needs WebGL.": "工坊需要 WebGL。",
  "Preparing the studio…": "正在准备工坊…",
  "Preparing the atelier": "正在准备工坊",
  "Sound and language": "声音与语言",
  "Switch language": "切换语言",
  "Mute sound": "静音",
  "Turn sound on": "打开声音",
  "Sound volume": "音量",
  "Sound ready": "声音就绪",
  "Sound muted": "已静音",
  "Sound on at {n} percent": "声音已开，音量 {n}%",
  "Sound ready at {n} percent": "声音就绪，音量 {n}%",
  "Saved": "已保存",
  "Saving…": "正在保存…",
  "Saved to this browser": "已保存到此浏览器",
  "Not saved — storage is unavailable": "未保存——浏览器存储不可用",
  "Closed": "合着",
  "Click the book to open it": "点击书本翻开",
  "End of the book": "书末",
  "Pages {range} of {count}": "第 {range} 页，共 {count} 页",
  "Page {range} of {count}": "第 {range} 页，共 {count} 页",
  "{count} pages": "共 {count} 页",
  "The atelier could not be prepared. Reload the page to try again.": "工坊未能准备好，请刷新页面重试。",
  "The 3D view paused after losing its graphics context. Your books are saved; reload to continue.":
    "图形环境丢失，3D 视图已暂停。你的书都已保存，刷新页面即可继续。",
  "WebGL is unavailable in this browser, so the 3D atelier cannot open here.": "此浏览器不支持 WebGL，无法打开 3D 工坊。",

  /* ----- shelf ----- */
  "1 volume on your shelf": "书架上有 1 册",
  "{n} volumes on your shelf": "书架上有 {n} 册",
  "by {author}": "{author} 著",
  "1 page template": "1 个页面模板",
  "{n} page templates": "{n} 个页面模板",
  "Select {title}": "选择《{title}》",
  "Open {title} in the atelier": "在工坊中打开《{title}》",
  "Made a copy: {title}": "已复制：{title}",
  "{title} (copy)": "{title}（副本）",
  "“{title}” will be removed from your shelf, with its cover and all of its pages. This cannot be undone.":
    "《{title}》连同封面和全部内页将从书架移除，且无法恢复。",
  "Deleted “{title}”.": "已删除《{title}》。",
  "Exported {name}.folio": "已导出 {name}.folio",
  "Imported “{title}”.": "已导入《{title}》。",
  "That file is not a Folio Atelier book.": "这不是 Folio Atelier 的书籍文件。",
  "Selected {title}, book {n} of {count}.": "已选中《{title}》，第 {n} 本，共 {count} 本。",
  "Spread {n} of {count}: {label}.": "第 {n} 个跨页，共 {count} 个：{label}。",
  "{title} opened. Drag a page or use the arrow keys to read.": "《{title}》已翻开。拖动书页或用方向键阅读。",
  "{title} closed.": "《{title}》已合上。",
  "Open in the atelier": "进入工坊",
  "Volume {n}": "第 {n} 册",
  "{title} taken to the atelier.": "《{title}》已取到工坊。",
  "Returning {title} to the shelf.": "正在把《{title}》放回书架。",
  "{title} returned to the shelf.": "《{title}》已放回书架。",
  "View reset.": "视角已重置。",
  "Custom foil": "定制箔",

  /* ----- presets ----- */
  "Ultramarine": "群青", "Ember": "余烬", "Citron": "香橼", "Cobalt": "钴蓝", "Vermilion": "朱砂",
  "Coral": "珊瑚", "Glacier": "冰川", "Nocturne": "夜曲", "Oxblood": "牛血红", "Oat": "燕麦",
  "Forest": "森林", "Plum": "梅紫", "Bone": "骨白", "Ink": "墨韵", "Jade": "翡翠",
  "Almanac": "年鉴", "Aurora": "极光", "Atlas": "舆图", "Meadow": "草甸", "Midnight": "午夜", "Bare": "素面", "Blank": "空白页",
  "Ultramarine cloth · copper foil": "群青书布 · 铜箔",
  "Burnt-orange cloth · antique gold": "焦橙书布 · 古金箔",
  "Citron cloth · black gloss": "香橼书布 · 亮黑",
  "Cobalt cloth · cool silver": "钴蓝书布 · 冷银箔",
  "Vermilion cloth · rose gold": "朱砂书布 · 玫瑰金箔",
  "Coral cloth · blush foil": "珊瑚书布 · 粉箔",
  "Icy-cyan cloth · aluminium": "冰青书布 · 铝箔",
  "Black leather · gold": "黑色皮革 · 金箔",
  "Oxblood leather · antique gold": "牛血红皮革 · 古金箔",
  "Natural linen · black pigment": "原色亚麻 · 黑色颜料",
  "Forest linen · gold": "墨绿亚麻 · 金箔",
  "Plum velvet · rose gold": "梅紫丝绒 · 玫瑰金箔",
  "Bone paper · printed label": "纸面 · 印刷书签",
  "Indigo paper · stab stitching · title slip": "靛蓝纸面 · 线装 · 题签",
  "Jade silk · blind clouds · gold": "翡翠丝绸 · 压凹祥云 · 金箔",
  "Quarter-bound cloth · printed lozenges": "四分之一装书布 · 印刷菱格",
  "Half leather · marbled sides · sprinkled edges": "半皮装 · 大理石纹 · 喷点书口",
  "Black buckram · holographic stars": "黑色粗帆布 · 幻彩星辰",
  "Vellum · engraved corners · bronze": "羊皮纸 · 雕花包角 · 青铜箔",
  "Sage linen · printed sprigs": "鼠尾草绿亚麻 · 印刷花枝",
  "Navy suede · blind waves · silver": "藏青麂皮 · 压凹青海波 · 银箔",
  "Plain cloth, nothing printed": "素面书布，不印任何内容",

  /* ----- studio: tabs and shared ----- */
  "Design": "设计", "Cover": "封面", "Spine": "书脊", "Back": "封底", "Details": "细节", "Pages": "内页",
  "Book title": "书名", "Subtitle": "副标题", "Series": "丛书", "Custom text": "自定义文字",
  "Foil": "烫箔", "Print": "印刷", "Blind": "压凹",
  "Series line": "丛书行", "Head mark": "书头标记", "Blurb": "简介", "Imprint": "出版标记", "Line": "文字行",
  "Empty": "空",
  "Print colour": "印刷颜色",
  "Finish": "工艺",
  "Ornament": "图案",
  "Size": "大小", "Across": "横向", "Down": "纵向",
  "Frame": "边框", "Inset": "内缩",
  "Text": "文字",
  "A few lines about the book…": "写几行关于这本书的话…",
  "Type a line": "输入一行文字",
  "Direction": "方向", "Along spine": "沿书脊", "Position": "位置",
  "Alignment": "对齐", "Left": "左", "Centre": "居中", "Right": "右", "Measure": "行宽",
  "Show on the cover": "显示",
  "Words": "内容",
  "Typeface": "字体", "Weight": "字重",
  "Light": "细体", "Regular": "常规", "Medium": "中等", "Semibold": "半粗", "Bold": "粗体",
  "Tracking": "字距",
  "Capitals": "全部大写", "Italic": "斜体", "Vertical": "竖排",
  "Remove this line": "移除这一行",
  "A new line": "新的一行",
  "Add a line": "添加一行",
  "Lettering": "文字",
  "Custom colour": "自定义颜色",

  /* ----- design tab ----- */
  "The book": "这本书",
  "These words are shared by the cover, spine, back and title page.": "这些文字由封面、书脊、封底和扉页共用。",
  "Optional": "可选",
  "Bindings": "装帧预设",
  "Binding preset": "装帧预设",
  "A complete starting point: cloth, foil, layout and ornament. Your words and pages are kept.":
    "一套完整的起点：面料、烫箔、版式和图案。你的文字和内页会保留。",
  "Material": "材质",
  "Covering": "面料",
  "Colour": "颜色",
  "Binding": "装订方式",
  "Full": "全装", "Quarter": "四分之一装", "Half": "半装",
  "Spine & corners": "书脊与包角",
  "Bookcloth": "书布", "Buckram": "粗帆布", "Linen": "亚麻", "Silk": "丝绸", "Leather": "皮革",
  "Suede": "麂皮", "Vellum": "羊皮纸", "Paper": "纸张", "Velvet": "丝绒",
  "Fine woven cotton": "细密的棉织物",
  "Heavy, open canvas weave": "厚实的粗纹帆布",
  "Coarse natural weave": "粗犷的天然织纹",
  "Fine rib, liquid sheen": "细棱纹，水一般的光泽",
  "Pebbled grain, soft sheen": "粒面纹理，柔和光泽",
  "Brushed nap, no shine": "磨绒表面，没有反光",
  "Smooth, faintly veined skin": "光滑、带淡淡纹理的皮面",
  "Uncoated laid stock": "未涂布的直纹纸",
  "Deep pile, strong sheen": "厚绒，强烈光泽",
  "Pattern": "纹样",
  "An all-over pattern on the boards: stamped in foil, printed, or pressed blind into the covering.":
    "铺满书壳的纹样：可以烫箔、印刷，或压凹在面料上。",
  "Strength": "强度",
  "Carry across the spine": "延续到书脊",
  "Used for everything stamped in foil on the boards and spine.": "用于书壳和书脊上所有烫箔的部分。",
  "Metal": "金属感", "Polish": "抛光", "Iridescence": "幻彩",
  "Leaf finish": "箔面", "Polished": "亮面", "Matte": "哑光", "Brushed": "拉丝",
  "Stamping": "压印",
  "Share": "分享", "Keep a picture of the book, a turntable to send, or its pages to print.": "保存这本书的图片、可发送的旋转动图，或可打印的内页。",
  "Save a picture": "保存图片", "Turntable GIF": "旋转动图", "Pages as PDF": "内页 PDF",
  "Taking the picture…": "正在拍照…", "Turning the book…": "正在转动书本…", "Printing the pages…": "正在印制内页…",
  "Saved {name}": "已保存 {name}", "That did not work. Please try again.": "没有成功，请再试一次。",
  "Export all": "全部导出", "Exported {count} books.": "已导出 {count} 本书。", "Imported {count} books.": "已导入 {count} 本书。",
  "Room": "房间", "Shelf": "书架", "Walnut": "胡桃木", "Oak": "橡木", "Painted": "白漆", "Steel": "黑钢", "Ledge": "浮板",
  "Follow the book": "随书配色",
  "Moved {title} to place {n} of {count}.": "已把《{title}》移到第 {n} 位，共 {count} 本。",
  "Printed as": "印制方式", "Photograph": "照片", "Duotone": "双色调", "Halftone": "网点", "Engraving": "版画线条",
  "Wax seal": "火漆印", "Letter": "字母", "From the title": "取自书名", "Wax": "火漆",
  "A seal of wax pressed on the board, with a letter. It takes the first letter of the title unless you give it one.": "压在封面上的火漆印，带一个字母。不填写时取书名的第一个字。",
  "Second foil": "第二种箔", "Zoom": "缩放", "Paste paper": "糊染纸", "Contour map": "等高线地图",
  "Used for everything stamped in foil on the boards and spine. Give any element the finish Second foil to stamp it in a second colour.": "封面、封底和书脊上所有烫箔的元素都用它。把任一元素的工艺设为“第二种箔”，就用第二种颜色烫印。",
  "Board corners": "书角", "Square": "直角", "Metal clasp": "金属搭扣", "Clasp metal": "搭扣金属",
  "Brass": "黄铜", "Blackened iron": "黑铁", "Pocket and slipcase": "内袋与书匣",
  "A paper pocket inside the front board, and a case that keeps the book on the shelf. The book slides out of it when you open it.": "封面内侧的纸袋，以及在书架上收纳书本的书匣。翻开时，书会从书匣里滑出。",
  "Inside pocket": "内袋", "Slipcase": "书匣", "Slipcase colour": "书匣颜色", "When on, the walls and the light take their colours from the book in view.": "打开后，墙面和光线会采用眼前这本书的配色。",
  "Lighting": "光线", "Studio": "工作室", "Morning": "清晨", "Golden hour": "黄昏金光", "Night": "夜晚台灯",
  "Format": "开本", "The size of the book and the thickness of its text block.": "书的尺寸和书芯的厚度。",
  "Trim size": "成品尺寸", "Pocket": "口袋本", "Fits a coat pocket": "能放进外套口袋", "Crown octavo": "小开本", "A slim novel": "轻薄的小说",
  "Standard": "标准", "A5-ish, the default": "接近 A5，默认", "Large": "大开本", "Royal octavo, a generous hardback": "皇家八开，宽大的精装",
  "Thickness": "厚度",
  "Closure": "闭合", "An elastic band that holds the book shut. It slips off when you open the book.": "一条把书合住的松紧带，翻开书时会自动松开。",
  "Elastic band": "松紧绑带", "Band colour": "绑带颜色",
  "Pen loop": "笔插", "A fabric loop on the back board to keep a pen with the book.": "封底上的布质笔插，让笔随书携带。", "Loop colour": "笔插颜色",
  "Notebook": "笔记页", "Ruled, dotted or squared pages to write in": "可书写的横线、点阵或方格页",
  "Ruling": "格式", "Number of pages": "页数", "Lined": "横线", "Dot grid": "点阵", "Squared": "方格",
  "Paste": "糊染纹", "Gauffered": "烫金压花",
  "Age": "做旧", "A well-loved copy: corners and edges rubbed, colour faded by the sun, foil worn thin.": "一本被翻阅多年的书：书角和书口磨损，颜色被阳光晒褪，烫箔变薄。",
  "Wear": "磨损", "Sun-fading": "日晒褪色",
  "Canvas": "帆布", "Thick, uneven cotton duck": "厚实、略不均匀的棉帆布",
  "Denim": "牛仔布", "Diagonal twill, pale weft showing": "斜纹组织，露出浅色纬线",
  "Cork": "软木", "Pressed granules, warm and matte": "压制颗粒，温暖哑光",
  "Snakeskin": "蛇皮", "Domed scales with a soft gloss": "微隆的鳞片，柔和光泽",
  "Wood veneer": "木皮", "Sliced grain under a satin lacquer": "刨切木纹，覆缎面清漆",
  "Acrylic": "亚克力", "Smooth cast sheet, high gloss": "光滑浇铸板，高光泽",
  "Onlay": "皮革嵌饰", "A piece of contrasting leather laid on the board, or set flush into it.": "在书壳上贴一块撞色皮革，或平嵌进去。",
  "Add a leather piece": "添加皮革嵌片", "Setting": "嵌法", "Laid on": "贴面凸起", "Set flush": "平嵌",
  "Shape": "形状", "Rectangle": "矩形", "Rounded": "圆角", "Oval": "椭圆", "Leather colour": "皮革颜色",
  "Width": "宽度", "Height": "高度",
  "How deep the die presses foil and blind stamps into the boards. Print lies flat.": "烫箔与素压在书壳上压得多深。印刷保持平整。",
  "Impression": "压印方式", "Debossed": "压凹", "Flat": "平压", "Embossed": "凸起", "Depth": "深度",
  "Gold": "金", "Antique gold": "古金", "Champagne": "香槟金", "Copper": "铜", "Bronze": "青铜",
  "Rose gold": "玫瑰金", "Silver": "银", "Aluminium": "铝", "Gunmetal": "枪灰", "Emerald": "翡翠绿",
  "Sapphire": "蓝宝石", "Ruby": "红宝石", "Holographic": "幻彩", "Pearl": "珍珠",
  "White pigment": "白色颜料", "Black gloss": "亮黑", "Custom": "自定义",
  "None": "无",
  "Pinstripe": "细条纹", "Awning stripe": "宽条纹", "Diagonal": "斜纹", "Check": "方格", "Dots": "圆点",
  "Harlequin": "菱格", "Chevron": "人字纹", "Herringbone": "鱼骨纹", "Wave scales": "青海波",
  "Linked circles": "七宝纹", "Honeycomb": "蜂巢", "Fret": "回纹", "Stars": "星辰", "Sprigs": "花枝",
  "Clouds": "祥云", "Marbled": "大理石纹", "Sprinkled": "喷点",

  /* ----- cover tab ----- */
  "Layout": "版式",
  "Cover layout": "封面版式",
  "How the title, ornament and names sit on the board.": "书名、图案和署名在封面上的位置。",
  "Classic": "经典", "Editorial": "杂志", "Plate": "图版", "Minimal": "极简", "Monument": "纪念碑",
  "Label": "书签", "Title slip": "题签", "Column": "竖排",
  "Border": "边框",
  "Single rule": "单线", "Double rule": "双线", "Thick & thin": "粗细线", "Rounded rule": "圆角线",
  "Corner marks": "角标", "Deco corners": "装饰角", "Flourished corners": "花饰角", "Beaded": "连珠",
  "Greek key": "希腊回纹", "Scalloped": "扇贝边", "Lozenge": "菱形", "Arch": "拱门", "Tooled fillets": "烫金线框", "Leaf roll": "叶纹滚边", "Corner fleurons": "角花", "Title panel": "书名贴签",
  "Nested brackets": "嵌套括号", "Crossing paths": "交错路径", "Caret & staves": "尖角与谱线", "Orbits": "轨道",
  "Modules": "模块", "Nested frames": "嵌套方框", "Drafting compass": "圆规", "Sunburst": "旭日",
  "Laurel wreath": "月桂花环", "Moon phases": "月相", "Waves": "波浪", "Compass star": "罗盘星",
  "Botanical branch": "枝叶", "Diamond lattice": "菱形格", "Monogram": "字母徽", "Seal": "印章",
  "Lotus": "莲花", "Auspicious cloud": "祥云", "Peaks": "山峦", "Bamboo": "竹", "Crescent & stars": "新月与星",
  "Tree": "树", "Quill": "羽毛笔", "Key": "钥匙", "Hourglass": "沙漏", "Eye": "眼", "Anchor": "锚",
  "Fleur-de-lis": "鸢尾纹", "Crown": "王冠", "Eight-point star": "八角星", "Rosette": "玫瑰花饰",
  "Book": "书卷", "Heart": "心", "Registration rings": "套准环",
  "Artwork": "图片",
  "Use your own picture as the whole cover or as an inset plate. Foil and print sit on top.":
    "把自己的图片铺满封面，或作为嵌入的图版。烫箔和印刷文字会叠在上面。",
  "Upload an image": "上传图片", "Replace image": "更换图片", "Remove": "移除",
  "That image could not be read.": "无法读取这张图片。",
  "Placement": "位置", "Full cover": "铺满封面",
  "Each line can use the book's shared words or its own text.": "每一行可以使用书的共用文字，也可以单独输入。",

  /* ----- spine / back ----- */
  "Structure": "结构",
  "Tooling": "压线",
  "Framed": "单框", "Double frame": "双框", "Raised bands": "竹节", "Panelled": "分格", "Tooled compartments": "烫金格饰", "Head & tail rules": "天地线", "Plain": "素面",
  "Tail emblem": "书脚徽记", "Ring": "圆环", "Diamond": "菱形", "Star": "星",
  "Title label": "书名贴签",
  "A pasted label behind the title, as on a library binding.": "贴在书名下的一块色签，常见于图书馆装帧。",
  "Show the label": "显示贴签",
  "Label colour": "贴签颜色",
  "Long titles shrink to fit. Chinese, Japanese and Korean titles are set upright.": "过长的书名会自动缩小；中日韩文书名竖排。",
  "A few lines for the back board.": "写在封底的几行字。",
  "What is this book, and who is it for?": "这是一本什么书？写给谁？",

  /* ----- details ----- */
  "Page edges": "书口",
  "Gilding and staining show on the three trimmed edges of the block.": "烫金和染色会出现在书芯的三个切口上。",
  "Natural": "原色", "Gilt": "烫金", "Stained": "染色", "Ombré": "渐变",
  "Leaf": "金箔", "Stain": "染色", "Sprinkle": "喷点",
  "Corner pieces": "包角",
  "Metal corners in the book's foil, on the two outer corners of each board.": "书壳外侧两角的金属包角，颜色跟随烫箔。",
  "Corners": "包角", "Engraved": "雕花",
  "Stab stitching": "线装",
  "Thread sewn through the boards and wrapped round the spine, as on a thread-bound book.": "丝线穿过书壳并绕过书脊，如同传统线装书。",
  "Sew the binding": "线装装订",
  "Holes": "孔数", "Four": "四眼", "Six": "六眼",
  "Thread": "线色",
  "Endpapers": "环衬",
  "The sheets pasted inside the boards — open the cover to see them.": "贴在书壳内侧的衬纸——翻开封面即可看到。",
  "Fine grid": "细格",
  "Paper colour": "纸色",
  "Ribbon & headbands": "书签带与堵头布",
  "Ribbon marker": "书签带", "Second ribbon": "第二条书签带", "Ribbon": "书签带",
  "Second ribbon colour": "第二条的颜色",
  "Headbands": "堵头布", "Striped headbands": "条纹堵头布", "Stripe": "条纹色",
  "The stock the book is printed on.": "印刷内页所用的纸。",
  "Stock": "纸张",
  "Cream": "米白", "Bright white": "亮白", "Ivory": "象牙白", "Soft grey": "浅灰", "Aged": "做旧", "Blush": "淡粉", "Rice paper": "宣纸",

  /* ----- pages ----- */
  "Select a page to edit it and to turn the book to it. Drag to reorder.": "选中一页即可编辑，并把书翻到那一页。拖动可调整顺序。",
  "Add after this page": "在此页后添加",
  "Add a page": "添加页面",
  "Half-title": "简名页", "Title page": "扉页", "Dedication": "献词", "Epigraph": "题词", "Contents": "目录",
  "Part title": "分卷页", "Chapter opener": "章首页", "Body text": "正文", "Verse": "诗歌", "Pull quote": "引文",
  "Colophon": "版本记", "Page": "页面", "Quotation": "引文",
  "The title alone": "只有书名",
  "Title, subtitle, author": "书名、副标题、作者",
  "A short line, centred": "一句短话，居中",
  "A short quotation before the text": "正文之前的一句引语",
  "Built from your chapters": "根据章节自动生成",
  "Divides the book into parts": "把全书分成几卷",
  "Number, title, opening text": "章号、章名、开篇文字",
  "Flows across pages": "自动续页",
  "Keeps your line breaks": "保留你的分行",
  "A large quotation": "大字引文",
  "Image or ornament with caption": "图片或图案，可加说明",
  "Notes on the edition": "关于这一版的说明",
  "An empty page": "空白页",
  "Chapter title": "章名",
  "A New Chapter": "新的一章",
  "Write here. The text continues onto new pages as it grows.": "在这里写。文字变长会自动续到新的一页。",
  "Heading": "标题",
  "Attribution": "出处",
  "Imprint line": "出版标记",
  "Title, subtitle, author and series come from the Design tab.": "书名、副标题、作者和丛书名来自“设计”页。",
  "The list is built from your chapter openers, with their page numbers.": "目录根据章首页自动生成，并带上页码。",
  "Same as the cover": "与封面相同",
  "Caption": "图片说明",
  "Fill the whole page": "铺满整页",
  "Leave empty and one is written for you from the book's typefaces and binding.": "留空则根据这本书的字体和装帧自动撰写。",
  "The half-title shows the book's title alone. Change it in the Design tab.": "简名页只显示书名，可在“设计”页修改。",
  "A blank page — useful for starting a chapter on a right-hand page.": "空白页——可用来让新一章从右手页开始。",
  "Part Title": "卷名",
  "Note": "附注",
  "An optional line under the title": "卷名下方的一行说明，可选",
  "One line of verse per line. Leave an empty line between stanzas.": "每行一句。诗节之间空一行。",
  "Empty text": "空白正文",
  "Image": "图片",
  "Written for you": "自动撰写",
  "Drag to reorder": "拖动排序",
  "Move up": "上移", "Move down": "下移", "Duplicate page": "复制此页", "Delete page": "删除此页",
  "Typography": "排版",
  "Applies to every page in the book.": "应用于全书每一页。",
  "Text face": "正文字体", "Heading face": "标题字体",
  "Text size": "字号", "Leading": "行距",
  "Chapter openings": "章首样式", "Centred": "居中", "Numeral": "大数字",
  "Page numbers at": "页码位置", "Outer corner": "外侧",
  "Printed labels": "印刷用语", "English": "English",
  "Black": "黑", "Sepia": "深褐", "Blue-black": "蓝黑", "Bottle green": "墨绿",
  "Justified": "两端对齐", "Drop capitals": "首字下沉", "Running heads": "页眉", "Page numbers": "页码",
  "Type *** on a line of its own for a section break.": "单独一行输入 *** 可插入分节符。",
  "Chapter {n} · {title}": "第 {n} 章 · {title}",
  "Part {n} · {title}": "第 {n} 卷 · {title}",
  // Keeping the library safe.
  "Not saved — kept for this visit only": "未保存——仅保留到本次访问结束",
  "Your library is open in another tab": "书库已在另一个标签页中打开",
  "Only one tab can edit your books at a time, so that neither saves over the other.": "同一时间只能有一个标签页编辑你的书，以免互相覆盖。",
  "Use it here": "在此使用",
  "Your library moved to another tab": "书库已转到另一个标签页",
  "Your books are being edited in another tab now. Nothing more is saved from this one.": "你的书现在在另一个标签页中编辑，这里不再保存任何改动。",
  "Waiting for another tab": "正在等待另一个标签页",
  "Close the other Folio Atelier tab and your library will open here.": "关闭另一个 Folio Atelier 标签页后，书库就会在这里打开。",
  "Folio Atelier was updated in another tab": "Folio Atelier 已在另一个标签页中更新",
  "Reload to keep working with the new version. Your books are saved.": "重新加载即可使用新版本继续工作。你的书都已保存。",
  "Reload": "重新加载",
  "{n} days ago": "{n} 天前",
  "Your library could not be read. Nothing is lost yet: reload to try again.": "书库暂时无法读取，内容并未丢失。请重新加载再试。",
  "This browser is not letting the atelier save. Books made now last until the tab closes; export them to keep them.": "此浏览器不允许工坊保存。现在做的书只保留到标签页关闭，请导出以留存。",
  "Your books were last exported {when}. Clearing site data would remove them.": "上次导出书库是{when}。清除网站数据会删掉这些书。",
  "Your books live only in this browser. Export a copy to keep them safe.": "你的书只保存在这个浏览器里。导出一份副本更安心。",
  "Not now": "稍后",
  "Resize the panel": "调整面板高度"
};

function detect() {
  const forced = new URLSearchParams(location.search).get("lang");
  if (forced === "en" || forced === "zh") return forced;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch (error) {
    // Fall through to the browser's language.
  }
  return /^zh\b/i.test(navigator.language || "") ? "zh" : "en";
}

let lang = detect();
const listeners = new Set();
/** English strings that had no translation; a development aid. */
export const missing = new Set();

export const getLang = () => lang;

export function t(text, vars) {
  if (text === null || text === undefined || text === "") return text ?? "";
  let result = String(text);
  if (lang === "zh") {
    const found = ZH[result];
    if (found !== undefined) result = found;
    else if (/[A-Za-z]{2}/.test(result)) missing.add(result);
  }
  if (vars) result = result.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));
  return result;
}

/**
 * Translate the static page. Elements marked `data-i18n` use their own English
 * text as the key (`data-i18n="html"` keeps inline markup); `data-i18n-attrs`
 * lists attributes to translate.
 */
export function localizeDocument(root = document) {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    const html = element.dataset.i18n === "html";
    if (element.i18nSource === undefined) {
      element.i18nSource = (html ? element.innerHTML : element.textContent).replace(/\s+/g, " ").trim();
    }
    if (html) element.innerHTML = t(element.i18nSource);
    else element.textContent = t(element.i18nSource);
  });
  root.querySelectorAll("[data-i18n-attrs]").forEach((element) => {
    if (!element.i18nAttrs) {
      element.i18nAttrs = Object.fromEntries(
        element.dataset.i18nAttrs.split(/\s+/).map((name) => [name, element.getAttribute(name)])
      );
    }
    Object.entries(element.i18nAttrs).forEach(([name, value]) => {
      if (value !== null) element.setAttribute(name, t(value));
    });
  });
  document.title = lang === "zh"
    ? "Folio Atelier — 个人 3D 制书工坊"
    : "Folio Atelier — A Personal 3D Bookmaking Studio";
}

export function setLang(next) {
  if (next !== "en" && next !== "zh") return;
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (error) {
    // Remembering the choice is optional.
  }
  localizeDocument();
  listeners.forEach((listener) => listener(lang));
}

export function onLang(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
