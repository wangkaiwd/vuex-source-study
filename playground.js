// const rawModule = {
//   state: {
//     age: 10,
//     person: {
//       profile: { job: 'developer', company: 'alipay', name: 'zs' },
//     }
//   },
//   getters: {
//     personalInfo (state) { // 获取个人信息
//       const { profile } = state.person;
//       return Object.keys(profile).reduce((prev, cur) => {
//         return prev + `${cur}: ${profile[cur]}; `;
//       }, '');
//     }
//   },
//   mutations: {
//     add (state, payload) {state.age = state.age + payload;},
//   },
//   actions: {
//     // const { commit } = store;
//     // this指向不一样
//     // commit()
//     // store.commit()
//     asyncAdd ({ commit }, payload) {
//       // 这里调用commit时，如果不提前指定this的话，this会指向undefined
//       setTimeout(() => {
//         commit('add', payload);
//       }, 2000);
//     }
//   },
//   modules: {
//     a: {
//       state: { name: 'name-a', person: { gender: 'man' } },
//       mutations: {
//         addA (state, payload) {}
//       },
//       getters: {
//         nameA (state) {return state.person.gender;}
//       },
//       modules: {
//         a1: {
//           state: { name: 'name-a1' },
//           modules: {
//             a11: { state: { name: 'name-a11' } }
//           }
//         }
//       }
//     }
//   }
// };

// const intermediateModule = {
//   state: {},
//   _children: {},
//   _rawModule: {}
// };

// 最终想要的格式
// const desireModule = {
//   state: {
//     a: { a1: {} }
//   },
//   mutations: { addA: [] },
//   actions: { asyncAddA: [] },
//   getters: {
//     personalInfo (state) {
//       return 'personalInfo';
//     },
//     nameA (state) {
//       return state.person.gender;
//     }
//   }
// };

const obj = { a: 1, b: 2, c: 3, modules: { x: { a: 1, b: 2, c: 3 } } };
// 提前将对象进行处理：
const newObj = {
  rawItem: {
    a: 1,
    b: 2,
    c: 3
  },
  children: {
    x: {
      children: {},
      rawItem: {
        a: 1,
        b: 2,
        c: 3
      }
    }
  }
};

Object.keys(obj).forEach(key => {

});
Object.keys(newObj).forEach(key => {

});
