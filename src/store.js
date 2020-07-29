import applyMixin from './mixin';
import devtoolPlugin from './plugins/devtool';
import ModuleCollection from './module/module-collection';
import { forEachValue, isObject, isPromise, assert, partial } from './util';

let Vue; // bind on install

export class Store {
  constructor (options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue);
    }

    if (__DEV__) {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`);
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`);
      assert(this instanceof Store, `store must be called with the new operator.`);
    }

    const {
      plugins = [], // 配置项中的插件选项，默认值为空对象
      strict = false
    } = options;

    // store internal state
    this._committing = false;
    this._actions = Object.create(null);
    this._actionSubscribers = [];
    this._mutations = Object.create(null);
    this._wrappedGetters = Object.create(null);
    this._modules = new ModuleCollection(options);
    this._modulesNamespaceMap = Object.create(null);
    this._subscribers = [];
    this._watcherVM = new Vue();
    this._makeLocalGettersCache = Object.create(null);
    // bind commit and dispatch to self
    const store = this;
    const { dispatch, commit } = this;
    // 相当于自己实现了一个简单的bind,更改函数的this指向
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload);
    };
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options);
    };

    // strict mode
    this.strict = strict;

    const state = this._modules.root.state;

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    installModule(this, state, [], this._modules.root);
    console.log(this);
    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    resetStoreVM(this, state);

    // apply plugins
    // 依次执行插件数组中的每个函数，参数为Store实例this，可以调用store的属性和方法
    plugins.forEach(plugin => plugin(this));

    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools;
    if (useDevtools) {
      devtoolPlugin(this);
    }
  }

  // 获取state的值时会store._vm._data.$$state中进行获取
  get state () {
    return this._vm._data.$$state;
  }

  set state (v) {
    if (__DEV__) {
      assert(false, `use store.replaceState() to explicit replace store state.`);
    }
  }

  commit (_type, _payload, _options) {
    // check object-style commit
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options);

    // 插件调用subscribe方法是回调函数的参数
    const mutation = { type, payload };
    const entry = this._mutations[type];
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown mutation type: ${type}`);
      }
      return;
    }
    // 用_withCommit包裹来判断是否同步更改state
    this._withCommit(() => {
      // commit时调用mutation,参数为payload
      entry.forEach(function commitIterator (handler) {
        handler(payload);
      });
    });

    // 调用commit更改state时，调用所有插件中订阅的方法
    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state));

    if (
      __DEV__ &&
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      );
    }
  }

  dispatch (_type, _payload) {
    // check object-style dispatch
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload);

    const action = { type, payload };
    const entry = this._actions[type];
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown action type: ${type}`);
      }
      return;
    }

    try {
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state));
    } catch (e) {
      if (__DEV__) {
        console.warn(`[vuex] error in before action subscribers: `);
        console.error(e);
      }
    }
    // 执行所有的actions，actions中的函数会被处理成返回Promise,当同一type有多个action时，通过Promise.all进行处理
    // 最终得到的result也是promise
    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload);
    // 如果不用处理额外逻辑的话，可以直接将promise进行返回
    // return result;
    // 返回一个新的Promise,该Promise的value是result的value，该Promise失败的reason是result失败的reason
    return new Promise((resolve, reject) => {
      result.then(res => {
        try {
          this._actionSubscribers
            .filter(sub => sub.after)
            .forEach(sub => sub.after(action, this.state));
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in after action subscribers: `);
            console.error(e);
          }
        }
        resolve(res);
      }, error => {
        try {
          // 插件订阅action调用
          this._actionSubscribers
            .filter(sub => sub.error)
            .forEach(sub => sub.error(action, this.state, error));
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in error action subscribers: `);
            console.error(e);
          }
        }
        reject(error);
      });
    });
  }

  subscribe (fn, options) {
    return genericSubscribe(fn, this._subscribers, options);
  }

  subscribeAction (fn, options) {
    const subs = typeof fn === 'function' ? { before: fn } : fn;
    return genericSubscribe(subs, this._actionSubscribers, options);
  }

  watch (getter, cb, options) {
    if (__DEV__) {
      assert(typeof getter === 'function', `store.watch only accepts a function.`);
    }
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options);
  }

  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state;
    });
  }

  registerModule (path, rawModule, options = {}) {
    // path为字符串时将其处理为数组
    if (typeof path === 'string') path = [path];

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
      assert(path.length > 0, 'cannot register the root module by using registerModule.');
    }

    // 进行模块收集，根据path以及用户传入的选项
    // 根据path将其放到this._modules.root上
    this._modules.register(path, rawModule);
    // 将新加到this._modules.root上的模块通过path安装到store上
    installModule(this, this.state, path, this._modules.get(path), options.preserveState);
    // reset store to update getters...
    // 为store添加新注册的getters
    resetStoreVM(this, this.state);
  }

  unregisterModule (path) {
    if (typeof path === 'string') path = [path];

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }

    this._modules.unregister(path);
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1));
      Vue.delete(parentState, path[path.length - 1]);
    });
    resetStore(this);
  }

  hasModule (path) {
    if (typeof path === 'string') path = [path];

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }

    return this._modules.isRegistered(path);
  }

  hotUpdate (newOptions) {
    this._modules.update(newOptions);
    resetStore(this, true);
  }

  _withCommit (fn) {
    const committing = this._committing;
    this._committing = true;
    fn();
    this._committing = committing;
  }
}

function genericSubscribe (fn, subs, options) {
  // 如果fn在subs中不存在，options中传入{ prepend: true }会将fn放到fn的第一项
  // 否则会将fn放入到subs中的最后一项
  if (subs.indexOf(fn) < 0) {
    options && options.prepend
      ? subs.unshift(fn)
      : subs.push(fn);
  }
  // 会返回取消订阅(unsubscribe)函数，将fn从subs中删除，这样在调用mutation的时候就不会触发fn
  return () => {
    const i = subs.indexOf(fn);
    if (i > -1) {
      subs.splice(i, 1);
    }
  };
}

function resetStore (store, hot) {
  store._actions = Object.create(null);
  store._mutations = Object.create(null);
  store._wrappedGetters = Object.create(null);
  store._modulesNamespaceMap = Object.create(null);
  const state = store.state;
  // init all modules
  installModule(store, state, [], store._modules.root, true);
  // reset vm
  resetStoreVM(store, state, hot);
}

function resetStoreVM (store, state, hot) {
  const oldVm = store._vm;

  // bind store public getters
  store.getters = {};
  // reset local getters cache
  store._makeLocalGettersCache = Object.create(null);
  const wrappedGetters = store._wrappedGetters;
  const computed = {};
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.
    // 将getter放到计算属性中
    computed[key] = partial(fn, store);
    // store.getters中的属性从store中创建的 vue instance 中获取
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    });
  });

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent;
  Vue.config.silent = true;
  // 通过创建Vue实例，然后将store.state定义在Vue的data中，保证state的响应性
  // 将getters放入到计算属性中，在从getters中取值时会从store._vm中获取
  store._vm = new Vue({
    data: {
      // 以_或者$开头的属性，将不会被代理在Vue实例上，因为它们可能与Vue内部的属性和API方法发生冲突
      // 您必须像vm.$data._property一样访问它们
      $$state: state
    },
    computed
  });
  Vue.config.silent = silent;

  // enable strict mode for new vm
  if (store.strict) {
    // 启用严格模式，当通过mutation异步更改state时会报错
    enableStrictMode(store);
  }

  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null;
      });
    }
    Vue.nextTick(() => oldVm.$destroy());
  }
}

// 安装模块
// store: Store的实例， rootState: 根模块state, path: 遍历的模块key组成的数组，module: 当前遍历模块
function installModule (store, rootState, path, module, hot) {
  // 当path为空数组时，遍历的是根模块
  const isRoot = !path.length;
  // 根据path获取当前遍历模块的命名空间namespace
  const namespace = store._modules.getNamespace(path);

  // register in namespace map
  if (module.namespaced) {
    if (store._modulesNamespaceMap[namespace] && __DEV__) {
      console.error(`[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join('/')}`);
    }
    // 在store上存储模块命名空间的映射，key为namespace,value为module
    // 每个模块都应该有自己单独的命名空间，方便检查命名空间是否重复并提醒用户
    store._modulesNamespaceMap[namespace] = module;
  }

  // set state
  if (!isRoot && !hot) {
    // 根据根state以及path找到对应的父state
    const parentState = getNestedState(rootState, path.slice(0, -1));
    // path的最后一项为当前处理的模块名
    const moduleName = path[path.length - 1];
    store._withCommit(() => {
      if (__DEV__) {
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join('.')}"`
          );
        }
      }
      // 保证为state赋值时，值为响应式
      Vue.set(parentState, moduleName, module.state);
      // state => this._modules.root.state
      // store._vm = new Vue({
      //    data: {
      //        $$state: state
      //    }
      // })
      // store.state => store._vm._data.$$state
      // 所以store.state和state即this._modules.root.state指向同一片堆内存空间，堆内存的键值对发生变化时，会同步更新
    });
  }
  // 生成当前模块的state,getters,commit,dispatch
  // 方便之后在注册mutation,action,getter时使用当前模块的一些属性和方法：
  // 如在action中可以使用局部的commit,dispatch来调用当前模块的mutation和action
  const local = module.context = makeLocalContext(store, namespace, path);

  // 为store设置mutations
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key;
    registerMutation(store, namespacedType, mutation, local);
  });

  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key;
    const handler = action.handler || action;
    registerAction(store, type, handler, local);
  });

  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key;
    registerGetter(store, namespacedType, getter, local);
  });

  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot);
  });
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
function makeLocalContext (store, namespace, path) {
  const noNamespace = namespace === '';
  // 当有命名空间的时候，为mutations和actions添加命名空间
  const local = {
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => { // 嵌套一个函数，帮助用户做一些事情
      const args = unifyObjectStyle(_type, _payload, _options);
      const { payload, options } = args;
      let { type } = args;

      if (!options || !options.root) {
        // 如果没有传入{ root: true }，会拼接命名空间
        type = namespace + type;
        if (__DEV__ && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`);
          return;
        }
      }
      // 在函数执行的时候执行真正的逻辑
      return store.dispatch(type, payload);
    },

    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options);
      const { payload, options } = args;
      let { type } = args;

      if (!options || !options.root) {
        type = namespace + type;
        if (__DEV__ && !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`);
          return;
        }
      }

      store.commit(type, payload, options);
    }
  };

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  // getters和state 通过 Object get 方法来定义获取值时进行的操作，这样可以同时定义多个属性的get/set方法
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  });

  return local;
}

function makeLocalGetters (store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {};
    const splitPos = namespace.length;
    Object.keys(store.getters).forEach(type => {
      // type = cart/cartProducts
      // namespace = cart/
      // skip if the target getter is not match this namespace
      if (type.slice(0, splitPos) !== namespace) return;

      // extract local getter type
      // 获取当前getter的key值，即cartProducts
      const localType = type.slice(splitPos);

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      // 将store中带有命名空间的getters处理为不带有命名空间的当前模块的getters
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      });
    });
    store._makeLocalGettersCache[namespace] = gettersProxy;
  }
  // 返回当前模块的getters
  return store._makeLocalGettersCache[namespace];
}

function registerMutation (store, type, handler, local) {
  const entry = store._mutations[type] || (store._mutations[type] = []);
  entry.push(function wrappedMutationHandler (payload) {
    handler.call(store, local.state, payload);
  });
}

function registerAction (store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = []);
  entry.push(function wrappedActionHandler (payload) {
    let res = handler.call(store, {
      // 当前模块的dispatch,会帮用户拼接命名空间。当传入第三个参数 { root: true }，调用全局的dispatch
      dispatch: local.dispatch,
      // 当前模块的commit, 会帮用户拼接命名空间
      commit: local.commit,
      // 当前模块的getters, 会从命名空间中将当前的getter进行分离
      getters: local.getters,
      // 通过path获取到当前模块的state
      state: local.state,
      // 全局的getters
      rootGetters: store.getters,
      // 全局的state
      rootState: store.state
    }, payload);
    if (!isPromise(res)) {
      // 返回值不是Promise的话通过Promise.resolve转换为Promise
      res = Promise.resolve(res);
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err);
        throw err;
      });
    } else {
      return res;
    }
  });
}

function registerGetter (store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    if (__DEV__) {
      console.error(`[vuex] duplicate getter key: ${type}`);
    }
    return;
  }
  // 将函数绑定到store._wrappedGetters中
  store._wrappedGetters[type] = function wrappedGetter (store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    );
  };
}

function enableStrictMode (store) {
  // 该操作是十分昂贵的，所以需要在生产环境禁用
  // 同步深度监听store中state的变化，当state改变没有通过mutation时，会抛出异常
  store._vm.$watch(function () { return this._data.$$state; }, () => {
    if (__DEV__) {
      assert(store._committing, `do not mutate vuex store state outside mutation handlers.`);
    }
  }, { deep: true, sync: true });
}

function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state);
}

function unifyObjectStyle (type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload;
    payload = type;
    type = type.type;
  }

  if (__DEV__) {
    assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`);
  }

  return { type, payload, options };
}

export function install (_Vue) {
  if (Vue && _Vue === Vue) {
    if (__DEV__) {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      );
    }
    return;
  }
  Vue = _Vue;
  applyMixin(Vue);
}
