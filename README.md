# live2d_models
萌萌哒的看板娘，以下资源来源于互联网，最底下会给出相关链接

------

### 使用方法  moc

#### Hexo

```shell
# 进入hexo根目录
cd hexo-dir
# 安装hexo-helper-live2d
npm install --save hexo-helper-live2d
# 创建目录live2d_models
mkdir live2d_models
# 把模型文件放进创建目录live2d_models，比如我这边下载的是index模型
cd live2d_models && wget index 
#重命名模型文件中的json文件，比如我下载的模型是index，所以model.json -> index.model.json
cd index 
mv model.json index.model.json
# 修改配置文件
vim hexo-dir/_config.yml 
live2d:
   enable: true # 是否开启live2d
   scriptFrom: local # 脚本从本地引入
   pluginRootPath: live2dw/ # 插件在站点上的根目录(相对路径)
   pluginJsPath: lib/ # 脚本文件相对与插件根目录路径
   pluginModelPath: assets/ # 模型文件相对与插件根目录路径
   tagMode: false # 标签模式, 是否仅替换 live2d tag标签而非插入到所有页面中
   debug: false # 调试, 是否在控制台输出日志
   model:
       use: index # 填写放进live2d_models文件夹中的模型文件夹名字
       scale: 1 # canvas 模型与canvas的缩放
   display:
       width: 150 # 宽度
       height: 300 # 高度
       position: left # 显示位置
       hOffset: 0 #水平偏移
       vOffset: -20 #垂直偏移
   mobile:
       show: true # 手机端是否显示
       scale: 0.5 # 移动设备上的缩放
```

#### Typecho

下载[保罗的看板娘插件](https://github.com/Dreamer-Paul/Pio)，并上传到你的插件目录（一般为 `usr/plugins`）。进入你的网站后台，在顶部的“控制台”下找到“插件” -> Pio -> 启用。启用之后我们就可以开始设置啦！

**引用模型**

插件默认提供两种方式引用模型，一个是读取插件指定目录下的模型，还有一个是另外引用。对于新手，我们比较推荐放在插件目录的 `model` 文件夹下。只要你在本站下载模型，都已经为这个插件专门做过一定的优化处理啦。

**显示不全？**

待我们放好模型之后可能会发现，模型显示不太齐全。这是由于高宽度设置不正确导致的~ 由于插件默认的模型是 `Pio`，而其他模型的比例和它不同，所以我们就需要在插件目录下手动设置它的宽度和高度啦！这样我们的模型就能正常显示出来了！

**遮住内容？**

如果你用的主题默认在左侧有侧边栏，发现模型遮住了菜单，那么我们就可以在插件设置里面修改它的位置，这样就可以遮住你的内容啦！

更多介绍详见：[给你的博客增加动态看板娘](https://paugram.com/coding/add-poster-girl-with-plugin.html)

#### EmLog

详见广树的文章 - [博客通用版 Live2D 伊斯特瓦尔发布](https://www.wikimoe.com/?post=76)

#### 其他平台

其他平台可以通过修改插件或是修改模板的方式引用看板娘。这里的方法适用于 WordPress、EMLog、Z-Blog 甚至是静态网站。

> 保罗的 [插件文档](https://docs.paul.ren/pio) 里已经提供了完整的独立版使用教程，你可以在不使用插件的情况下正常食用看板娘。以下方法仅简单引用了看板娘，但并不包含交互功能。

下载 [来自玩水大佬的封装](https://github.com/journey-ad/live2d_src) 项目，我们会在 `src/lib` 目录下得到一个 `live2d.min.js` 。这个就是核心啦！

然后在你的网页上添加一个 `canvas` 画布，一般放在 `footer.php` 即页尾文件里面。一般写成这样：

```
<canvas id="paul" width="280" height="250"></canvas>
```

其中 `id` 部分负责让脚本获得画布的位置，`width` 和 `height` 分别是宽度和高度，在这里设置你的模型宽高。

然后我们就需要引用这个 JS 文件啦！方法也很简单，你把这个文件放在合适的位置，或是用 CDN 引用皆可。

```
<script src="live2d.min.js"></script>
```

> 注意：要确认画布放在 `<script>` 的前面！

接着我们再通过一段简单的代码来开始引用我们的模型：

```
<script>loadlive2d('paul', '模型路径/model.json');</script>
```

这样我们的网站上，就显示出自己的看板娘啦！

细心的你肯定会发现，看板娘被放在了正常的位置显示了出来，而不是 “悬挂” 在页面的某个位置。我们通过添加一段简单的 CSS 就可以做到了！

```
#paul{
    left: 0;
    bottom: 0;
    z-index: 520; /* 如果模型被遮住可以把它改的更大 */
    position: fixed;
    pointer-events: none; /* 防止遮住鼠标点击页面其他内容 */
}
```

于是我们网站上就有了自己的看板娘啦！

------

### 使用方法 moc3

参考

https://github.com/HCLonely/Live2dV3

https://github.com/Yukariin/AzurLaneL2DViewer

```html
<!------ 位置可自定义 ------>
<div class="Canvas" style="position: fixed; right: 10px; bottom: 10px;z-index: 99999999" id="L2dCanvas"></div>

<!-- Pollyfill script -->
<script src="https://unpkg.com/core-js-bundle@3.6.1/minified.js"></script>
<!-- Live2DCubismCore script -->
<script src = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"></script>
<!-- Build script -->
<script src = "./assets/js/live2dv3.js"></script>

<!------ 加载Live2d模型 | Load Live2d model ------>
<script>
    var l2dv;
  window.onload = () => {
    l2dv = new L2dViewer({
        el: document.getElementById('L2dCanvas'),
        modelHomePath: './assets/model/moc3/',
        // modelHomePath: 'https://cdn.jsdelivr.net/gh/alg-wiki/AzurLaneL2DViewer@gh-pages/assets/',
        model: 'yichui_2',
        // bgImg: 'https://cdn.jsdelivr.net/gh/alg-wiki/AzurLaneL2DViewer@gh-pages/assets/bg/bg_church_jp.png',
        bgImg: './assets/image/bg/bg_1.png',
        width: 500,
        height: 300,
        autoMotion: false,
        _finishedLoadModel: function() {
          var motionDiv = document.getElementById("motionDiv"); 
          motionDiv.innerHTML = "";
          l2dv.getMotions().forEach((v,k) => {
            let motionName = k;
            if(motionName.startsWith('motions/')) {
              motionName = motionName.replace('motions/', '');
            }
            motionName = motionName.replace('.motion3.json', '');
            var bt = document.createElement("button");
            bt.innerHTML = motionName; 
            bt.classList.add('btnGenericText');
            bt.onclick = function () {                          //绑定点击事件
              l2dv.startMotion(k);
            };
            motionDiv.appendChild(bt);
          })
        },
        _onTap: function() {
            // 点击canvas触发事件
        }
    });
  }
</script>
```
------
|     参数      |             类型              |                             描述                             |  默认   |
| :-----------: | :---------------------------: | :----------------------------------------------------------: | :-----: |
|     `el`      | [必需] DOM 对象或 jQuery 对象 | 要挂载Live2d模型的元素, 支持DOM选择器和jQuery选择器，例：`document.getElementById('L2dCanvas')`或`document.querySelector('#L2dCanvas')`或`$('#L2dCanvas')` | `null`  |
|  `modelHomePath`   |         [必需] String    |                          模型根目录                          | `null`  |
|  `model`  |         [必需] String         |                        初始显示模型                           | `null`  |
|    `bgImg`    |         [可选] String         |                    Canvas背景图片，有图片的话，Canvas的宽高会等于背景图片宽高                    |  `null`  |
|    `width`    |         [可选] Number         |                    Canvas宽度，单位: `px`                    |  `500`  |
|   `height`    |         [可选] Number         |                    Canvas高度，单位: `px`                    |  `300`  |
|  `autoMotion`  |        [可选] Boolean        |                   是否自动随机触发Motion                     | `true` |
| `_finishedLoadModel` |  [可选] Function       |                   模型加载完回调函数                         | `null` |
|   `_onTap`    |         [可选] Function       |  点击模型触发函数，为空的话会默认触发随机Motion               | `null`  |

------

```js
// L2dViewer 对外暴露的方法
// 获取模型信息
public getModel(): LAppModel {
}
// 加载模型
public loadModel(modelName: string) {
}
// 触发模型 motion
public startMotion(motionName: string) {
}
// 获取模型 motion
public getMotions(): Map<any,any> {
}
// 设置模型背景
public setBgImg(bgImg: string) {
}
```

------

当然，你感兴趣的话，并且有一定的前端基础，建议自己构建 **live2dv3.js**，可以下载官方提供的[Live2d Web Sdk](https://www.live2d.com/download/cubism-sdk/)，里面已经包含一个简单示例了，

**lappdefine.ts**  定义基本的参数
**lappdelegate.ts** 初始化,释放资源,事件绑定
**lapplive2dmanager.ts** 模型的管理类,进行模型生成和废弃,事件的处理,模型切换.
**lappmodel.ts** 模型类,定义模型的基本属性
**lappal.ts** 读取文件,抽象文件数据(算是工具类)
**lappsprite.ts** 动画精灵类,(有h5游戏开发应该了解)
**lapptexturemanager.ts** 纹理管理类,进行图像读取和管理的类
**lappview.ts** 视图类,生成模型的图像被lapplive2dmanager管理
**main.ts** 主程序启动程序
**touchmanager.ts** 事件的管理类(比如移动鼠标,点击鼠标,触摸屏触碰等)

简单修改下就可以了，也可以参照我的[demo代码](https://github.com/jianchengwang/todo-web/raw/master/live2d-web)

### 模型预览

#### 梦象网站资源 moc

##### 茵蒂克丝 index

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/index.jpg)

动漫《魔法禁书目录》中女主角。有着银色的长发、绿色的眼瞳、雪白的肌肤，年龄约十四五岁，却有着可爱的幼儿体型。

模型作者：未知
模型出处：网络搜集

------



##### 尤莉 youri

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/youri.jpg)

尤莉是由 つくみず 创作的漫画《少女终末旅行》及其衍生作品中的登场角色。性格极度乐观，非常喜欢吃东西。

模型作者：罐装猫粮君
模型出处：[【Live2D工房】Vol.1 Part2 尤 脸扁再来一份 《少女终末旅行》](https://www.bilibili.com/video/av17779694)

****

##### 雪未来 snow_miku

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/snow_miku.jpg)

雪未来是 Crypton 旗下虚拟歌手初音未来的二次创作系列造型，民间有时称其为 “雪初音” 或 “雪 MIKU”。自 2010 年被确立为日本北海道札幌冰雪节的应援角色。自 2012 年起，每年会以网络征集投票的形式决定新的雪未来人物形象。

模型作者：未知
模型出处：网络搜集

推荐设置：

宽度：300
高度：300

------

##### 凉风青叶 aoba

##### ![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/aoba.jpg)

来自 New Game! 的凉风青叶和你见面啦！

推荐设置：

高度：250
宽度：200

------

##### 工作中的血小板 platelet

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/platelet.jpg)



模型作者：Neko_KK
模型出处：Live2DViewer 创意工坊

------

##### 干物妹小埋 umaru

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/umaru.jpg)

模型作者：未知
模型出处：未知

推荐设置：

高度：300
宽度：100

##### 和泉纱雾 sagiri

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/sagiri.jpg)

模型作者：oukaitou
模型出处：Live2DViewer 创意工坊

推荐设置：

高度：500
宽度：默认

##### 康娜 kanna

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/kanna.jpg)

模型作者：oukaitou
模型出处：Live2DViewer 创意工坊

------

##### 时崎狂三 kurumi

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/kurumi.jpg)

模型作者：未知
模型出处：约会大作战手游官网

------

##### 雷姆 rem

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/rem.jpg)

提取自 [广树的项目](https://github.com/eeg1412/Live2dRem)。

推荐设置：

高度：275
宽度：230

高度：335
宽度：280

------

##### 香风智乃 chino

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/chino.jpg)

香风智乃，漫画《请问您今天要来点兔子吗？》中及其衍生作品中女主角之一。咖啡店 Rabbit House 老板的孙女，13 岁的初中生。身形娇小却意外地能干，店内杂务也几乎由她一手包办，个性冷静又沉默寡言，但其实是在人际交往上有点笨拙。

模型作者：Hernes_VR
模型出处：FaceRig 创意工坊

------

##### 鹿目圆 madoka

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/madoka.jpg)

鹿目圆是原创动画《魔法少女小圆》及其衍生作品中主角。就读于市立见泷原中学二年级的一位普通初中生。个头小巧可爱，性格温柔且为朋友着想。因为本身的潜质，而成为魔法少女。后成为神，消失在世界上。

模型作者：未知
模型出处：网络搜集

推荐设置：

高度：300
宽度：230

------

##### 22 娘全身版

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/22.jpg)

22 娘是娱乐向弹幕视频站点 Bilibili 的吉祥物。阳光元气娘，火拼有精神。对人热情、热心，但有些冒失。

模型作者：未知
模型出处：网络搜集

推荐设置：

高度：400
宽度：150

------

##### 涅普迪努 neptune

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/neptune.jpg)

涅普迪努，又称 “涅普顿”。是《超次元游戏：海王星》等海王星系列游戏中紫色大陆 Planeptune 的守护女神。性格乐天、天真浪漫，很擅长调节气氛。有时会从女神的工作中翘班，经常懒懒的，但因为天生的性格原因，仍然受到周围人的欢迎。

模型作者：未知
模型出处：网络搜集

------

#### Eikanya提取 moc3

这个大佬提取了很多，所以这里只列出我喜欢的部分模型，[在线预览](https://jianchengwang.github.io/live2d_models/)

##### yichui_2



![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/yichui_2.jpg)

------

 ##### dujiaoshou_6

![](https://github.com/jianchengwang/live2d_models/raw/main/_model_images/dujiaoshou_6.jpg)

------



### 资源来源

[Live2d官网](https://www.live2d.com/zh-CHS/)

[梦象 Live2D 模型站](https://mx.paugram.com)

[Eikanya/Live2d-model](https://github.com/Eikanya/Live2d-model)

[Azur Lane Live2D Viewer](https://l2d.alg-wiki.com/)

[DownGit](https://minhaskamal.github.io/DownGit/#/home)