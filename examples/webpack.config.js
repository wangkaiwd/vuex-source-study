const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const VueLoaderPlugin = require('vue-loader/lib/plugin');

// bundle: 从许多不同的模块产生，`bundles`包含已经经历过加载和编译处理的源文件的最终版本
// chunk: 这是webpack特定的术语，被用来从内部去管理捆绑过程。`Bundles`由如`entry`和`child`这些类型的`chunks`组成。
//        通常，`chunks`直接对应于输出`bundle`，然后，有一些不会产生一对一关系的配置
module.exports = {
  mode: 'development',

  // 这里用reduce的原因：将一个数组最终处理为一个对象
  // 这种将数组最终整合成一个元素的逻辑，可以使用reduce来进行处理

  // 最终输出：
  // entries {
  //   chat: [
  //     'webpack-hot-middleware/client',
  //     '/Users/wangkai/workSpace/personalCode/study01/vueJs/vuex-source-study/examples/chat/app.js'
  //   ],
  //   counter: [
  //     'webpack-hot-middleware/client',
  //     '/Users/wangkai/workSpace/personalCode/study01/vueJs/vuex-source-study/examples/counter/app.js'
  //   ],
  //   'counter-hot': [
  //     'webpack-hot-middleware/client',
  //     '/Users/wangkai/workSpace/personalCode/study01/vueJs/vuex-source-study/examples/counter-hot/app.js'
  //   ],
  //   'shopping-cart': [
  //     'webpack-hot-middleware/client',
  //     '/Users/wangkai/workSpace/personalCode/study01/vueJs/vuex-source-study/examples/shopping-cart/app.js'
  //   ],
  //   todomvc: [
  //     'webpack-hot-middleware/client',
  //     '/Users/wangkai/workSpace/personalCode/study01/vueJs/vuex-source-study/examples/todomvc/app.js'
  //   ]
  // }
  // entries的key是chunk的名字，值描述了chunk的入口点
  entry: fs.readdirSync(__dirname).reduce((entries, dir) => {
    const fullDir = path.join(__dirname, dir);
    const entry = path.join(fullDir, 'app.js');
    if (fs.statSync(fullDir).isDirectory() && fs.existsSync(entry)) {
      entries[dir] = ['webpack-hot-middleware/client', entry];
    }
    return entries;
  }, {}),
  output: {
    path: path.join(__dirname, '__build__'), // bundle写入path指定的目录，需要使用绝对路径
    filename: '[name].js', // 决定每个输出bundle的名字的选项
    chunkFilename: '[id].chunk.js', // 非入口chunk文件的名字
    publicPath: '/__build__/', // 1. 加载静态资源 2. cdn  值为运行时或loader创建的每个url前缀
  },

  module: {
    rules: [
      { test: /\.js$/, exclude: /node_modules/, use: ['babel-loader'] },
      { test: /\.vue$/, use: ['vue-loader'] },
      { test: /\.css$/, use: ['vue-style-loader', 'css-loader'] }
    ]
  },

  resolve: {
    alias: {
      vuex: path.resolve(__dirname, '../src/index.js')
    }
  },

  // 这里并不太懂
  // @see: https://stackoverflow.com/questions/48985780/webpack-4-create-vendor-chunk
  optimization: {
    splitChunks: {
      cacheGroups: {
        vendors: {
          name: 'shared',
          filename: 'shared.js',
          chunks: 'initial', // @see: https://webpack.js.org/plugins/split-chunks-plugin/#splitchunkschunks
        }
      }
    }
  },

  plugins: [
    // vue-loader文档提供的用法
    new VueLoaderPlugin(),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoEmitOnErrorsPlugin(),
    new webpack.DefinePlugin({ // 允许创建在编译时配置的常量。这在开发构建和生产构建允许不同的行为时是有用的
      __DEV__: JSON.stringify(true),
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV),
      }
    })
  ]
};
