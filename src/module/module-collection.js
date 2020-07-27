import Module from './module';
import { assert, forEachValue } from '../util';

export default class ModuleCollection {
  constructor (rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false);
  }

  // 通过path来获取到对应的子模块
  get (path) {
    return path.reduce((module, key) => {
      return module.getChild(key);
    }, this.root);
  }

  getNamespace (path) {
    let module = this.root;
    return path.reduce((namespace, key) => {
      module = module.getChild(key);
      return namespace + (module.namespaced ? key + '/' : '');
    }, '');
  }

  update (rawRootModule) {
    update([], this.root, rawRootModule);
  }

  register (path, rawModule, runtime = true) {
    if (__DEV__) {
      assertRawModule(path, rawModule);
    }
    // 格式化用户配置项，并为每个模块原型上添加一些公有方法，方便调用
    const newModule = new Module(rawModule, runtime);
    console.log('newModule', newModule);
    // 处理根模块
    if (path.length === 0) {
      this.root = newModule;
    } else { // 处理子模块
      // 通过path找到父模块
      const parent = this.get(path.slice(0, -1));
      // 将父模块的子模块赋值为当前遍历的模块，key为path的最后一项
      parent.addChild(path[path.length - 1], newModule);
      // parent._children[path[path.length-1]] = newModule
    }

    // register nested modules
    if (rawModule.modules) { // 递归处理子模块
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        this.register(path.concat(key), rawChildModule, runtime);
      });
    }
  }

  unregister (path) {
    const parent = this.get(path.slice(0, -1));
    const key = path[path.length - 1];
    const child = parent.getChild(key);

    if (!child) {
      if (__DEV__) {
        console.warn(
          `[vuex] trying to unregister module '${key}', which is ` +
          `not registered`
        );
      }
      return;
    }

    if (!child.runtime) {
      return;
    }

    parent.removeChild(key);
  }

  isRegistered (path) {
    const parent = this.get(path.slice(0, -1));
    const key = path[path.length - 1];

    return parent.hasChild(key);
  }
}

function update (path, targetModule, newModule) {
  if (__DEV__) {
    assertRawModule(path, newModule);
  }

  // update target module
  targetModule.update(newModule);

  // update nested modules
  if (newModule.modules) {
    for (const key in newModule.modules) {
      if (!targetModule.getChild(key)) {
        if (__DEV__) {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
            'manual reload is needed'
          );
        }
        return;
      }
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      );
    }
  }
}

const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
};

const objectAssert = {
  assert: value => typeof value === 'function' ||
    (typeof value === 'object' && typeof value.handler === 'function'),
  expected: 'function or object with "handler" function'
};

const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
};

function assertRawModule (path, rawModule) {
  Object.keys(assertTypes).forEach(key => {
    if (!rawModule[key]) return;

    const assertOptions = assertTypes[key];

    forEachValue(rawModule[key], (value, type) => {
      assert(
        assertOptions.assert(value),
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      );
    });
  });
}

function makeAssertionMessage (path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`;
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`;
  }
  buf += ` is ${JSON.stringify(value)}.`;
  return buf;
}
