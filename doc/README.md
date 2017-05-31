
## sw-router [![sw][1]][2]

PWA 全称是 `Progressive Web Apps`。它的目的就是让你的网页越来越快。主要内容可以参考：[PWA-cookbook][3]。不过，它上手的难度也是有的。它本身是基于 worker 而发展出 Service Worker，所以，要使用 PWA 你就必须学会如何使用 SW，然后，SW 里面还有很多坑要踩。而其中最大的坑就是，如何处理文件资源的缓存，这个一直都是 CS 领域的心病。当然，在 SW 中，这也是有点困难的。不过，为了大家能更快的掌握 SW 这里，鄙人写了一个关于处理 fetch 事件的路由分发库 [sw-router][4]。

这里也主要介绍一下它。

## 下载

```
npm install sw-router
```

由于是在 SW 中使用，所以一般的 CMD/ES6 模块 写法是不能用的。推荐是直接到 `node_modules` 找到 `sw-router` 文件夹，复制其中的 `index.js` 到你的 `sw.js` 的工作目录。然后直接引入：

```
importScripts('./index.js');
```

## 使用

使用 SW 缓存功能其实很简单，你不需要写啥 `install`，`sync`，`activate`事件。因为这些和你要操作的缓存都不是直接关系。最简单就是直接监听 `fetch` 即可。

```
self.addEventListener('fetch', (event)=>{
    // doSth()
});
```

不过，如果你要做的是比较大业务，单单使用一个 fetch 就有点 “势单力薄”。所以，本库还是基于最小业务原则的出发点来进行创作的。

通过导入之后，sw-router 会 SW 作用域下绑定一个 `Router` 对象。接着，你就可以在该对象上绑定相关的路由处理。

### 路由绑定

利用 Router 对象进行路由绑定和 express router 类似，所以上手起来也不是特别大的问题：

```
Router.get('/*.js',(event,req)=>{
  console.log('to save js files');
  // doSth()
})
.get('/*.png',(event,req)=>{
  console.log('capture PNG:' + req.toString());
  // doSth()
})
.get('/.*',(event,req)=>{
  console.log('capture others request');
  // doSth()
})
```

它以链式的方法，来提供 restful 形式的路由注册。常用方法有：

  - all: 监听所有方法，不论是啥，get/post/put/patch。
  - get: 监听指定 get 方法的请求。
  - post: 监听指定 post 方法的请求。 
  - patch: 监听指定 patch 方法的请求。
  - put: 监听指定 put 方法的请求。

使用格式如下(5 种方法使用都一样)：
 
```
Router.get('/*.js',(event,req)=>{
 ...
})
```
 
其中，event,req 参数分别为：

 - event: 为 fetch 方法的回调参数。

```
self.addEventListener('fetch', (event)=>{
    // doSth()
});
```

 - req: 等同于 event.request

当然，这里不仅仅只提供了路由绑定的功能，还提供了缓存的做法。

### 缓存文件

缓存的方法也绑定在 `Router` 对象上，它的使用如下：

```
Router.get('/*.js',(event,req)=>{
  console.log('to save js files');
  Router.save('test',event);
})
```

它的格式为：

```
Router.save(cacheName, event);
```

 - cacheName: 为你缓存文件方式的文件夹的名字。你也可以理解为数据库中的 table。只是为了区分缓存文件的一个目录而已。如果你不写的话，默认为 `defaultName`。所以，使用方式也可以为：

```
Router.get('/*.js',(event,req)=>{
  console.log('to save js files');
  Router.save(event);
})
```

 - event: 就是你注册路由的 event 参数。直接传进去就好。


上面，大致介绍了路由注册这一块内容，但是，如果使用你注册好的路由分发系统呢？

### 投入生产

路由系统真正接入 SW 是通过 `watch` 方法来进行监听的。具体使用为：

```
Router.get('/*.js',(event,req)=>{
  console.log('save js files');
  Router.save('v1',event);
})
.get('/*.png',(event,req)=>{
  console.log('capture PNG:' + req.toString());
  Router.save('v1',event);
})
.get('/.*',(event,req)=>{
  console.log('capture all request');
})

self.addEventListener('fetch', function(event) {
 // start to listen
  Router.watch(event);
});
```

注意，watch 只能传入 event 参数，其它的就不要乱传了。

## 英文文档

[sw-router][5]

## 反馈

如果在使用库的同时，遇到什么问题，可以去 [issue][6] 提一提。鄙人一定会及时处理并回复。

## 作者

[villainhr][7]

## License

ISC


  [1]: https://img.shields.io/badge/npm-sw--router-brightgreen.svg
  [2]: https://www.npmjs.com/package/sw-router
  [3]: https://github.com/JimmyVV/PWA-cookbook/wiki/PWA-guider
  [4]: https://github.com/JimmyVV/sw-router
  [5]: https://github.com/JimmyVV/sw-router
  [6]: https://github.com/JimmyVV/sw-router/issues
  [7]: https://www.villainhr.com/page/2017/04/16/%E6%88%91