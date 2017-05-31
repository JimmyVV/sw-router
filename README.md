## sw-router [![sw][1]][2]

the repository is developed for newhands to quickly study PWA(`Progressive Web Apps`). It is designed to create a router system for capturing fetch request. And the most difficult thing in Service Worker is how to deal with cache files and save files in to CacheStorage. So, here, you will get a repo which could provide you some ways to listen on requests and cache files.

## install

```
npm install sw-router
```

Because you will use this repo in Service Worker, you couldn't use the format like CMD or ES6 Modules. the preferred ways is to copy the `index.js` in `node_modules/sw-router` into `service_worker.js` directory. then, you could import sw-router in you `service_worker.js`:

```
// maybe other names
importScripts('./index.js');
```

## Usage

when you are using service worker, the simples way is that you only need to write some code to listen on `fetch` event, like:

```
self.addEventListener('fetch', (event)=>{
    // doSth()
});
```

because the most useful feature in service worker is caching files. so now, we gonna study how to capture files and save them.

### Listen on Router

All the method are bound on the `Router` Object in Service Worker scope. And its format is like expree router.

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

It supply a chainable way to call these method. all the method it provides are below:

  - all: listen on all request，get/post/put/patch。
  - get: only get request.
  - post: only post request.
  - patch: only patch request.
  - put: only put request.


Their format are the same:

```
Router.get('/*.js',(event,req)=>{
 ...
})
```

 - event: you will get this param from `fetch` event callback. like:

```
self.addEventListener('fetch', (event)=>{
    // doSth()
});
```

 - req: it equals event.request 
 
And if you want to listen on more than one routes, you can simply write all your routes into an array or separately divide routes by comma.

```
# listen on more routes

## use comma's format
get('/path','/demo',cb) 

## use array's format
get(['/path','/demo'],cb) 

```


### Cache Files

You will find a `save` function on the `Router` Object. It is used to cache files.

```
Router.get('/*.js',(event,req)=>{
  console.log('to save js files');
  Router.save('test',event);
})
```

Its format:

```
Router.save(cacheName, event);
```

 - cacheName: You could set it for your CacheStorage Name. The cacheName is just like the tableName in common database like mysql. But if you don't want to give one, the default name is `defaultName`. So, you also could use like:

```
Router.get('/*.js',(event,req)=>{
  console.log('to save js files');
  Router.save(event);
})
```

 - event: It is the param in callback, just directly passing it.
 
### Complete Code

When you finish all preparing work, you could put the router into `fetch` callback by `watch` function.

```
self.addEventListener('fetch', function(event) {
 // start to listen
  Router.watch(event);
});
```

So, the easy way to use this repo just imitate below code:

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
## 中文文档

[sw-router][3]

## Feedback

If you have any problem, you can contact with me by [issue][4].

## Author

[villainhr][5]


## License

ISC


  [1]: https://img.shields.io/badge/npm-sw--router-brightgreen.svg
  [2]: https://www.npmjs.com/package/sw-router
  [3]: https://github.com/JimmyVV/sw-router/blob/master/doc/README.md
  [4]: https://github.com/JimmyVV/sw-router/issues
  [5]: https://www.villainhr.com/