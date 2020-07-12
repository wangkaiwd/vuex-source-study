## 阅读思路

### `readme.md`文档
文档中主要介绍了使用`Vuex`实现的几个例子，以及运行项目的方法。

* [`Examples`](https://github.com/vuejs/vuex#examples)

### `package.json`文件

* `npm dev`做了什么
* `server.js`的代码怎样编写？
  * 通过文档查看2个库的用法
    * webpack-dev-middleware
    * [Using webpack-dev-middleware](https://v4.webpack.js.org/guides/development/#using-webpack-dev-middleware)
    * webpack-hot-middleware
  * 学习`webpack`的配置项：
    * [`glossary`](https://v4.webpack.js.org/glossary/)
    
### `vuex`的`demo`搭建思路
> 通过`webpack`结合`express`搭建服务并将页面进行实时打包。

适用于比较简单的`demo`展示：
* `index.html`中设置统一的跳转
* 配置多入口文件，每一个都是对应单独的`Vue`应用
* 将打包好的`js`文件引入

#### 挑战
> 尝试了解下面的知识，为自己开发库做准备

* `git`提交规范如何控制
* 如何进行版本管理
  * release
  * changelog
