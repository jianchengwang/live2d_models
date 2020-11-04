document.write('<div class="Canvas" style="position: fixed; right: -120px; bottom: 5px;z-index: 99999999" id="L2dCanvas"></div>');
// 依赖js
// 兼容低版本浏览器
document.write('<script src="https://cdn.jsdelivr.net/npm/promise-polyfill@8/dist/polyfill.min.js"> </script>');
// 音频播放
document.write('<script src="https://cdn.jsdelivr.net/npm/howler@2.1.3/dist/howler.min.js"></script>');
// 必需
document.write('<script src="https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"></script>');
document.write('<script src="https://cdn.jsdelivr.net/npm/pixi.js@4.6.1/dist/pixi.min.js"></script>');
// live2dv3.js
document.write('<script src="https://cdn.jsdelivr.net/npm/live2dv3@1.2.2/live2dv3.min.js"></script>');
var l2dv
window.onload = () => {
    l2dv = new l2dViewer({
        el: document.getElementById('L2dCanvas'), // 要添加Live2d的元素
        basePath: 'https://cdn.jsdelivr.net/gh/alg-wiki/AzurLaneL2DViewer@gh-pages/assets', // 模型根目录
        modelName: 'dujiaoshou_6', // 模型名称
        sounds: [ // 触摸播放声音
            'sounds/demo.mp3', // 相对路径是相对于模型文件夹
            'https://cdn.jsdelivr.net/npm/live2dv3@latest/assets/biaoqiang_3/sounds/demo.mp3' // 也可以是网址
        ]
    })
}

function loadModel() {
    var modelName = document.getElementById('modelName').value
    console.info(modelName + ' loading....' )
    l2dv.loadModel(modelName)
}
  