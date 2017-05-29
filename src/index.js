import pathtoRegexp from '../lib/path-to-regexp';
import Log from '../lib/log';

const log = new Log('web-service-router');

/**
 * method match rule:
 *  0: all
 *  1: get
 *  2: post
 *  3: patch
 *  4: put
 */

class Router {
  constructor() {
    // noop

    /**
     * save registered routes
     *  format: [method,urls,cb]
     *    @method {Number}
     *    @urls {Array}
     *    @cb {Function}
     */
    this._routes = [];
    this._request; // save the route
  }
  // initially call `watch` function
  watch(request) {
    // check the type of url
    if (!this._extract(request))
      return;

    let {
      method,
      url
    } = this._request;

    url = this
      ._resolve(url)
      .pathname;
    method = this._methodMatch(method.toLowerCase());

    var tempArr = this
      ._routes
      .filter(route => {
        return route[0] === method
      });

    let flag = false;
    for (var route of tempArr) {
      let urls = route[1];
      for (var destUrl of urls) {
        if (!!pathtoRegexp(destUrl).exec(url)) {
          flag = true;
          break;
        }
      }

      if (!flag)
        continue;

      route[2](this._event, this._request);
      break;
    }
  }
  _extract(event) {
    // only accept 'event'
    if (this._getType(event) !== 'fetchevent') {
      log.e('watch(event) only accept <event> param from fetch callback');
      return false;
    }
    this._request = event.request;
    this._event = event;
    return true;
  }
  _getType(obj) {
    return Object
      .prototype
      .toString
      .call(obj)
      .match(/\s([a-zA-Z]+)/)[1]
      .toLowerCase();
  }
  _resolve(href) {
    return new URL(href);
  }
  _urlDB(urls, cb, method = 0) {
    this
      ._routes
      .push([method, urls, cb]);
  }
  _methodMatch(name) {
    switch (name) {
      case 'all':
        return 0;
      case 'get':
        return 1;
      case 'post':
        return 2;
      case 'patch':
        return 3;
      case 'put':
        return 4;
      default:
        return 0;
    }
  }
  _paramResolve(params, method = 'get') {
    if (params.length === 0) {
      log.e('the param of route is empty')
      return;
    }
    // check the last param is callback
    let cb = params.pop();
    if (this._getType(cb) !== 'function') {
      log.e("the type of callback is incorrect, your cb is " + cb);
      return;
    }

    // save urls
    let routes = [];
    params.forEach(url => {
      if (this._getType(url) === 'array') {
        routes = url;
      } else if (this._getType(url) === 'string') {
        routes.push(url)
      } else {
        log.e("the urls of get(urls) should only be array or string. like '/path' || ['/path','" +
          "/demo']");
        return;
      }
    });
    method = this._methodMatch(method);
    this._urlDB(routes, cb, method);
  }
  get(...params) {
    this._paramResolve(params, 'get');
    return this;
  }
  post(...params) {
    this._paramResolve(params, 'post');
    return this;
  }
  patch(...params) {
    this._paramResolve(params, 'patch');
    return this;
  }
  put(...params) {
    this._paramResolve(params, 'put');
    return this;
  }
  all(...params) {
    this._paramResolve(params, 'all');
    return this;
  }
  save(cacheName, event) {
    if (event === undefined) {
      event = cacheName;
      cacheName = 'defaultName';
    }

    if (this._getType(event) !== 'fetchevent') {
      // check fetchevent
      log.e('the param [' + this._getType(event) + '] of save is wrong' +
        '/n' +
        'it only accpet [event]');
        return;
    }

    let request = event.request;
    event.respondWith(caches.match(request).then(res => {
      if (res)
        return res;

      let reqClone = request.clone();

      return fetch(request).then(res => {
        // failed
        if (!res || res.status !== 200 || res.type !== 'basic') {
          return res;
        }

        let resClone = res.clone();

        caches
          .open(cacheName)
          .then(cache => {
            cache.put(reqClone, resClone);
          });
        return res;
      })
    }))
  }
}

self.Router = new Router();

/**
 * trigger method is Router.watch(event or request or string)
 */


/**
 * the calling ways:
 *  get('/path','/demo',cb) or
 *  get(['/path','/demo'],cb) or
 *  get('/path',cb)  only one route
 */
