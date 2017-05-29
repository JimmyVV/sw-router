(function () {
'use strict';

var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();

var isarray = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
// Match escaped characters that would otherwise appear in future matches.
// This allows the user to escape special characters that won't transform.
'(\\\\.)',
// Match Express-style parameters and un-named parameters with a prefix
// and optional suffixes. Matches appear as:
//
// "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?", undefined]
// "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined, undefined]
// "/*"            => ["/", undefined, undefined, undefined, undefined, "*"]
'([\\/.])?(?:(?:\\:(\\w+)(?:\\(((?:\\\\.|[^\\\\()])+)\\))?|\\(((?:\\\\.|[^\\\\()])+)\\))([+*?])?|(\\*))'].join('|'), 'g');

/**
 * Parse a string for the raw tokens.
 *
 * @param  {string}  str
 * @param  {Object=} options
 * @return {!Array}
 */
function parse(str, options) {
  var tokens = [];
  var key = 0;
  var index = 0;
  var path = '';
  var defaultDelimiter = options && options.delimiter || '/';
  var res;

  while ((res = PATH_REGEXP.exec(str)) != null) {
    var m = res[0];
    var escaped = res[1];
    var offset = res.index;
    path += str.slice(index, offset);
    index = offset + m.length;

    // Ignore already escaped sequences.
    if (escaped) {
      path += escaped[1];
      continue;
    }

    var next = str[index];
    var prefix = res[2];
    var name = res[3];
    var capture = res[4];
    var group = res[5];
    var modifier = res[6];
    var asterisk = res[7];

    // Push the current path onto the tokens.
    if (path) {
      tokens.push(path);
      path = '';
    }

    var partial = prefix != null && next != null && next !== prefix;
    var repeat = modifier === '+' || modifier === '*';
    var optional = modifier === '?' || modifier === '*';
    var delimiter = res[2] || defaultDelimiter;
    var pattern = capture || group;

    tokens.push({
      name: name || key++,
      prefix: prefix || '',
      delimiter: delimiter,
      optional: optional,
      repeat: repeat,
      partial: partial,
      asterisk: !!asterisk,
      pattern: pattern ? escapeGroup(pattern) : asterisk ? '.*' : '[^' + escapeString(delimiter) + ']+?'
    });
  }

  // Match any characters still remaining.
  if (index < str.length) {
    path += str.substr(index);
  }

  // If the path exists, push it onto the end.
  if (path) {
    tokens.push(path);
  }

  return tokens;
}

/**
 * Escape a regular expression string.
 *
 * @param  {string} str
 * @return {string}
 */
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|\/\\])/g, '\\$1');
}

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {string} group
 * @return {string}
 */
function escapeGroup(group) {
  return group.replace(/([=!:$\/()])/g, '\\$1');
}

/**
 * Attach the keys as a property of the regexp.
 *
 * @param  {!RegExp} re
 * @param  {Array}   keys
 * @return {!RegExp}
 */
function attachKeys(re, keys) {
  re.keys = keys;
  return re;
}

/**
 * Get the flags for a regexp from the options.
 *
 * @param  {Object} options
 * @return {string}
 */
function flags(options) {
  return options.sensitive ? '' : 'i';
}

/**
 * Pull out keys from a regexp.
 *
 * @param  {!RegExp} path
 * @param  {!Array}  keys
 * @return {!RegExp}
 */
function regexpToRegexp(path, keys) {
  // Use a negative lookahead to match only capturing groups.
  var groups = path.source.match(/\((?!\?)/g);

  if (groups) {
    for (var i = 0; i < groups.length; i++) {
      keys.push({
        name: i,
        prefix: null,
        delimiter: null,
        optional: false,
        repeat: false,
        partial: false,
        asterisk: false,
        pattern: null
      });
    }
  }

  return attachKeys(path, keys);
}

/**
 * Transform an array into a regexp.
 *
 * @param  {!Array}  path
 * @param  {Array}   keys
 * @param  {!Object} options
 * @return {!RegExp}
 */
function arrayToRegexp(path, keys, options) {
  var parts = [];

  for (var i = 0; i < path.length; i++) {
    parts.push(pathToRegexp(path[i], keys, options).source);
  }

  var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options));

  return attachKeys(regexp, keys);
}

/**
 * Create a path regexp from string input.
 *
 * @param  {string}  path
 * @param  {!Array}  keys
 * @param  {!Object} options
 * @return {!RegExp}
 */
function stringToRegexp(path, keys, options) {
  return tokensToRegExp(parse(path, options), keys, options);
}

/**
 * Expose a function for taking tokens and returning a RegExp.
 *
 * @param  {!Array}          tokens
 * @param  {(Array|Object)=} keys
 * @param  {Object=}         options
 * @return {!RegExp}
 */
function tokensToRegExp(tokens, keys, options) {
  if (!isarray(keys)) {
    options = /** @type {!Object} */keys || options;
    keys = [];
  }

  options = options || {};

  var strict = options.strict;
  var end = options.end !== false;
  var route = '';

  // Iterate over the tokens and create our regexp string.
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];

    if (typeof token === 'string') {
      route += escapeString(token);
    } else {
      var prefix = escapeString(token.prefix);
      var capture = '(?:' + token.pattern + ')';

      keys.push(token);

      if (token.repeat) {
        capture += '(?:' + prefix + capture + ')*';
      }

      if (token.optional) {
        if (!token.partial) {
          capture = '(?:' + prefix + '(' + capture + '))?';
        } else {
          capture = prefix + '(' + capture + ')?';
        }
      } else {
        capture = prefix + '(' + capture + ')';
      }

      route += capture;
    }
  }

  var delimiter = escapeString(options.delimiter || '/');
  var endsWithDelimiter = route.slice(-delimiter.length) === delimiter;

  // In non-strict mode we allow a slash at the end of match. If the path to
  // match already ends with a slash, we remove it for consistency. The slash
  // is valid at the end of a path match, not in the middle. This is important
  // in non-ending mode, where "/test/" shouldn't match "/test//route".
  if (!strict) {
    route = (endsWithDelimiter ? route.slice(0, -delimiter.length) : route) + '(?:' + delimiter + '(?=$))?';
  }

  if (end) {
    route += '$';
  } else {
    // In non-ending mode, we need the capturing groups to match as much as
    // possible by using a positive lookahead to the end or next path segment.
    route += strict && endsWithDelimiter ? '' : '(?=' + delimiter + '|$)';
  }

  return attachKeys(new RegExp('^' + route, flags(options)), keys);
}

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 *
 * @param  {(string|RegExp|Array)} path
 * @param  {(Array|Object)=}       keys
 * @param  {Object=}               options
 * @return {!RegExp}
 */
function pathToRegexp(path, keys, options) {
  if (!isarray(keys)) {
    options = /** @type {!Object} */keys || options;
    keys = [];
  }

  options = options || {};

  if (path instanceof RegExp) {
    return regexpToRegexp(path, /** @type {!Array} */keys);
  }

  if (isarray(path)) {
    return arrayToRegexp( /** @type {!Array} */path, /** @type {!Array} */keys, options);
  }

  return stringToRegexp( /** @type {string} */path, /** @type {!Array} */keys, options);
}

var Log = function () {
    function Log(name) {
        classCallCheck(this, Log);

        this.name = name;
    }

    createClass(Log, [{
        key: "w",
        value: function w(msg) {
            console.warn("[" + this.name + "]====> " + new Date().toTimeString() + "\n              : " + msg);
        }
    }, {
        key: "l",
        value: function l(msg) {
            console.log("[" + this.name + "]====> " + new Date().toTimeString() + "\n              : " + msg);
        }
    }, {
        key: "e",
        value: function e(msg) {
            console.error("[" + this.name + "]====> " + new Date().toTimeString() + "\n              : " + msg);
        }
    }, {
        key: "i",
        value: function i(msg) {
            console.info("[" + this.name + "]====> " + new Date().toTimeString() + "\n              : " + msg);
        }
    }]);
    return Log;
}();

var log = new Log('web-service-router');

/**
 * method match rule:
 *  0: all
 *  1: get
 *  2: post
 *  3: patch
 *  4: put
 */

var Router = function () {
  function Router() {
    classCallCheck(this, Router);

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


  createClass(Router, [{
    key: 'watch',
    value: function watch(request) {
      // check the type of url
      if (!this._extract(request)) return;

      var _request = this._request,
          method = _request.method,
          url = _request.url;


      url = this._resolve(url).pathname;
      method = this._methodMatch(method.toLowerCase());

      var tempArr = this._routes.filter(function (route) {
        return route[0] === method;
      });

      var flag = false;
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = tempArr[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var route = _step.value;

          var urls = route[1];
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = urls[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var destUrl = _step2.value;

              if (!!pathToRegexp(destUrl).exec(url)) {
                flag = true;
                break;
              }
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }

          if (!flag) continue;

          route[2](this._event, this._request);
          break;
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
  }, {
    key: '_extract',
    value: function _extract(event) {
      // only accept 'event'
      if (this._getType(event) !== 'fetchevent') {
        log.e('watch(event) only accept <event> param from fetch callback');
        return false;
      }
      this._request = event.request;
      this._event = event;
      return true;
    }
  }, {
    key: '_getType',
    value: function _getType(obj) {
      return Object.prototype.toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
    }
  }, {
    key: '_resolve',
    value: function _resolve(href) {
      return new URL(href);
    }
  }, {
    key: '_urlDB',
    value: function _urlDB(urls, cb) {
      var method = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

      this._routes.push([method, urls, cb]);
    }
  }, {
    key: '_methodMatch',
    value: function _methodMatch(name) {
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
  }, {
    key: '_paramResolve',
    value: function _paramResolve(params) {
      var _this = this;

      var method = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'get';

      if (params.length === 0) {
        log.e('the param of route is empty');
        return;
      }
      // check the last param is callback
      var cb = params.pop();
      if (this._getType(cb) !== 'function') {
        log.e("the type of callback is incorrect, your cb is " + cb);
        return;
      }

      // save urls
      var routes = [];
      params.forEach(function (url) {
        if (_this._getType(url) === 'array') {
          routes = url;
        } else if (_this._getType(url) === 'string') {
          routes.push(url);
        } else {
          log.e("the urls of get(urls) should only be array or string. like '/path' || ['/path','" + "/demo']");
          return;
        }
      });
      method = this._methodMatch(method);
      this._urlDB(routes, cb, method);
    }
  }, {
    key: 'get',
    value: function get$$1() {
      for (var _len = arguments.length, params = Array(_len), _key = 0; _key < _len; _key++) {
        params[_key] = arguments[_key];
      }

      this._paramResolve(params, 'get');
      return this;
    }
  }, {
    key: 'post',
    value: function post() {
      for (var _len2 = arguments.length, params = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        params[_key2] = arguments[_key2];
      }

      this._paramResolve(params, 'post');
      return this;
    }
  }, {
    key: 'patch',
    value: function patch() {
      for (var _len3 = arguments.length, params = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
        params[_key3] = arguments[_key3];
      }

      this._paramResolve(params, 'patch');
      return this;
    }
  }, {
    key: 'put',
    value: function put() {
      for (var _len4 = arguments.length, params = Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
        params[_key4] = arguments[_key4];
      }

      this._paramResolve(params, 'put');
      return this;
    }
  }, {
    key: 'all',
    value: function all() {
      for (var _len5 = arguments.length, params = Array(_len5), _key5 = 0; _key5 < _len5; _key5++) {
        params[_key5] = arguments[_key5];
      }

      this._paramResolve(params, 'all');
      return this;
    }
  }, {
    key: 'save',
    value: function save(cacheName, event) {
      if (event === undefined) {
        event = cacheName;
        cacheName = 'defaultName';
      }

      if (this._getType(event) !== 'fetchevent') {
        // check fetchevent
        log.e('the param [' + this._getType(event) + '] of save is wrong' + '/n' + 'it only accpet [event]');
        return;
      }

      var request = event.request;
      event.respondWith(caches.match(request).then(function (res) {
        if (res) return res;

        var reqClone = request.clone();

        return fetch(request).then(function (res) {
          // failed
          if (!res || res.status !== 200 || res.type !== 'basic') {
            return res;
          }

          var resClone = res.clone();

          caches.open(cacheName).then(function (cache) {
            cache.put(reqClone, resClone);
          });
          return res;
        });
      }));
    }
  }]);
  return Router;
}();

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

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbImxpYi9wYXRoLXRvLXJlZ2V4cC5qcyIsImxpYi9sb2cuanMiLCJzcmMvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsidmFyIGlzYXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChhcnIpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhcnIpID09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuXG4vKipcbiAqIEV4cG9zZSBgcGF0aFRvUmVnZXhwYC5cbiAqL1xuLy8gbW9kdWxlLmV4cG9ydHMgPSBwYXRoVG9SZWdleHBcbi8vIG1vZHVsZS5leHBvcnRzLnBhcnNlID0gcGFyc2Vcbi8vIG1vZHVsZS5leHBvcnRzLmNvbXBpbGUgPSBjb21waWxlXG4vLyBtb2R1bGUuZXhwb3J0cy50b2tlbnNUb0Z1bmN0aW9uID0gdG9rZW5zVG9GdW5jdGlvblxuLy8gbW9kdWxlLmV4cG9ydHMudG9rZW5zVG9SZWdFeHAgPSB0b2tlbnNUb1JlZ0V4cFxuXG5leHBvcnQgZGVmYXVsdCBwYXRoVG9SZWdleHA7XG5leHBvcnQge3BhcnNlLGNvbXBpbGUsdG9rZW5zVG9GdW5jdGlvbix0b2tlbnNUb1JlZ0V4cH07XG5cbi8qKlxuICogVGhlIG1haW4gcGF0aCBtYXRjaGluZyByZWdleHAgdXRpbGl0eS5cbiAqXG4gKiBAdHlwZSB7UmVnRXhwfVxuICovXG52YXIgUEFUSF9SRUdFWFAgPSBuZXcgUmVnRXhwKFtcbiAgLy8gTWF0Y2ggZXNjYXBlZCBjaGFyYWN0ZXJzIHRoYXQgd291bGQgb3RoZXJ3aXNlIGFwcGVhciBpbiBmdXR1cmUgbWF0Y2hlcy5cbiAgLy8gVGhpcyBhbGxvd3MgdGhlIHVzZXIgdG8gZXNjYXBlIHNwZWNpYWwgY2hhcmFjdGVycyB0aGF0IHdvbid0IHRyYW5zZm9ybS5cbiAgJyhcXFxcXFxcXC4pJyxcbiAgLy8gTWF0Y2ggRXhwcmVzcy1zdHlsZSBwYXJhbWV0ZXJzIGFuZCB1bi1uYW1lZCBwYXJhbWV0ZXJzIHdpdGggYSBwcmVmaXhcbiAgLy8gYW5kIG9wdGlvbmFsIHN1ZmZpeGVzLiBNYXRjaGVzIGFwcGVhciBhczpcbiAgLy9cbiAgLy8gXCIvOnRlc3QoXFxcXGQrKT9cIiA9PiBbXCIvXCIsIFwidGVzdFwiLCBcIlxcZCtcIiwgdW5kZWZpbmVkLCBcIj9cIiwgdW5kZWZpbmVkXVxuICAvLyBcIi9yb3V0ZShcXFxcZCspXCIgID0+IFt1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBcIlxcZCtcIiwgdW5kZWZpbmVkLCB1bmRlZmluZWRdXG4gIC8vIFwiLypcIiAgICAgICAgICAgID0+IFtcIi9cIiwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBcIipcIl1cbiAgJyhbXFxcXC8uXSk/KD86KD86XFxcXDooXFxcXHcrKSg/OlxcXFwoKCg/OlxcXFxcXFxcLnxbXlxcXFxcXFxcKCldKSspXFxcXCkpP3xcXFxcKCgoPzpcXFxcXFxcXC58W15cXFxcXFxcXCgpXSkrKVxcXFwpKShbKyo/XSk/fChcXFxcKikpJ1xuXS5qb2luKCd8JyksICdnJylcblxuLyoqXG4gKiBQYXJzZSBhIHN0cmluZyBmb3IgdGhlIHJhdyB0b2tlbnMuXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSAgc3RyXG4gKiBAcGFyYW0gIHtPYmplY3Q9fSBvcHRpb25zXG4gKiBAcmV0dXJuIHshQXJyYXl9XG4gKi9cbmZ1bmN0aW9uIHBhcnNlIChzdHIsIG9wdGlvbnMpIHtcbiAgdmFyIHRva2VucyA9IFtdXG4gIHZhciBrZXkgPSAwXG4gIHZhciBpbmRleCA9IDBcbiAgdmFyIHBhdGggPSAnJ1xuICB2YXIgZGVmYXVsdERlbGltaXRlciA9IG9wdGlvbnMgJiYgb3B0aW9ucy5kZWxpbWl0ZXIgfHwgJy8nXG4gIHZhciByZXNcblxuICB3aGlsZSAoKHJlcyA9IFBBVEhfUkVHRVhQLmV4ZWMoc3RyKSkgIT0gbnVsbCkge1xuICAgIHZhciBtID0gcmVzWzBdXG4gICAgdmFyIGVzY2FwZWQgPSByZXNbMV1cbiAgICB2YXIgb2Zmc2V0ID0gcmVzLmluZGV4XG4gICAgcGF0aCArPSBzdHIuc2xpY2UoaW5kZXgsIG9mZnNldClcbiAgICBpbmRleCA9IG9mZnNldCArIG0ubGVuZ3RoXG5cbiAgICAvLyBJZ25vcmUgYWxyZWFkeSBlc2NhcGVkIHNlcXVlbmNlcy5cbiAgICBpZiAoZXNjYXBlZCkge1xuICAgICAgcGF0aCArPSBlc2NhcGVkWzFdXG4gICAgICBjb250aW51ZVxuICAgIH1cblxuICAgIHZhciBuZXh0ID0gc3RyW2luZGV4XVxuICAgIHZhciBwcmVmaXggPSByZXNbMl1cbiAgICB2YXIgbmFtZSA9IHJlc1szXVxuICAgIHZhciBjYXB0dXJlID0gcmVzWzRdXG4gICAgdmFyIGdyb3VwID0gcmVzWzVdXG4gICAgdmFyIG1vZGlmaWVyID0gcmVzWzZdXG4gICAgdmFyIGFzdGVyaXNrID0gcmVzWzddXG5cbiAgICAvLyBQdXNoIHRoZSBjdXJyZW50IHBhdGggb250byB0aGUgdG9rZW5zLlxuICAgIGlmIChwYXRoKSB7XG4gICAgICB0b2tlbnMucHVzaChwYXRoKVxuICAgICAgcGF0aCA9ICcnXG4gICAgfVxuXG4gICAgdmFyIHBhcnRpYWwgPSBwcmVmaXggIT0gbnVsbCAmJiBuZXh0ICE9IG51bGwgJiYgbmV4dCAhPT0gcHJlZml4XG4gICAgdmFyIHJlcGVhdCA9IG1vZGlmaWVyID09PSAnKycgfHwgbW9kaWZpZXIgPT09ICcqJ1xuICAgIHZhciBvcHRpb25hbCA9IG1vZGlmaWVyID09PSAnPycgfHwgbW9kaWZpZXIgPT09ICcqJ1xuICAgIHZhciBkZWxpbWl0ZXIgPSByZXNbMl0gfHwgZGVmYXVsdERlbGltaXRlclxuICAgIHZhciBwYXR0ZXJuID0gY2FwdHVyZSB8fCBncm91cFxuXG4gICAgdG9rZW5zLnB1c2goe1xuICAgICAgbmFtZTogbmFtZSB8fCBrZXkrKyxcbiAgICAgIHByZWZpeDogcHJlZml4IHx8ICcnLFxuICAgICAgZGVsaW1pdGVyOiBkZWxpbWl0ZXIsXG4gICAgICBvcHRpb25hbDogb3B0aW9uYWwsXG4gICAgICByZXBlYXQ6IHJlcGVhdCxcbiAgICAgIHBhcnRpYWw6IHBhcnRpYWwsXG4gICAgICBhc3RlcmlzazogISFhc3RlcmlzayxcbiAgICAgIHBhdHRlcm46IHBhdHRlcm4gPyBlc2NhcGVHcm91cChwYXR0ZXJuKSA6IChhc3RlcmlzayA/ICcuKicgOiAnW14nICsgZXNjYXBlU3RyaW5nKGRlbGltaXRlcikgKyAnXSs/JylcbiAgICB9KVxuICB9XG5cbiAgLy8gTWF0Y2ggYW55IGNoYXJhY3RlcnMgc3RpbGwgcmVtYWluaW5nLlxuICBpZiAoaW5kZXggPCBzdHIubGVuZ3RoKSB7XG4gICAgcGF0aCArPSBzdHIuc3Vic3RyKGluZGV4KVxuICB9XG5cbiAgLy8gSWYgdGhlIHBhdGggZXhpc3RzLCBwdXNoIGl0IG9udG8gdGhlIGVuZC5cbiAgaWYgKHBhdGgpIHtcbiAgICB0b2tlbnMucHVzaChwYXRoKVxuICB9XG5cbiAgcmV0dXJuIHRva2Vuc1xufVxuXG4vKipcbiAqIENvbXBpbGUgYSBzdHJpbmcgdG8gYSB0ZW1wbGF0ZSBmdW5jdGlvbiBmb3IgdGhlIHBhdGguXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSAgICAgICAgICAgICBzdHJcbiAqIEBwYXJhbSAge09iamVjdD19ICAgICAgICAgICAgb3B0aW9uc1xuICogQHJldHVybiB7IWZ1bmN0aW9uKE9iamVjdD0sIE9iamVjdD0pfVxuICovXG5mdW5jdGlvbiBjb21waWxlIChzdHIsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIHRva2Vuc1RvRnVuY3Rpb24ocGFyc2Uoc3RyLCBvcHRpb25zKSlcbn1cblxuLyoqXG4gKiBQcmV0dGllciBlbmNvZGluZyBvZiBVUkkgcGF0aCBzZWdtZW50cy5cbiAqXG4gKiBAcGFyYW0gIHtzdHJpbmd9XG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIGVuY29kZVVSSUNvbXBvbmVudFByZXR0eSAoc3RyKSB7XG4gIHJldHVybiBlbmNvZGVVUkkoc3RyKS5yZXBsYWNlKC9bXFwvPyNdL2csIGZ1bmN0aW9uIChjKSB7XG4gICAgcmV0dXJuICclJyArIGMuY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikudG9VcHBlckNhc2UoKVxuICB9KVxufVxuXG4vKipcbiAqIEVuY29kZSB0aGUgYXN0ZXJpc2sgcGFyYW1ldGVyLiBTaW1pbGFyIHRvIGBwcmV0dHlgLCBidXQgYWxsb3dzIHNsYXNoZXMuXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfVxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5mdW5jdGlvbiBlbmNvZGVBc3RlcmlzayAoc3RyKSB7XG4gIHJldHVybiBlbmNvZGVVUkkoc3RyKS5yZXBsYWNlKC9bPyNdL2csIGZ1bmN0aW9uIChjKSB7XG4gICAgcmV0dXJuICclJyArIGMuY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikudG9VcHBlckNhc2UoKVxuICB9KVxufVxuXG4vKipcbiAqIEV4cG9zZSBhIG1ldGhvZCBmb3IgdHJhbnNmb3JtaW5nIHRva2VucyBpbnRvIHRoZSBwYXRoIGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiB0b2tlbnNUb0Z1bmN0aW9uICh0b2tlbnMpIHtcbiAgLy8gQ29tcGlsZSBhbGwgdGhlIHRva2VucyBpbnRvIHJlZ2V4cHMuXG4gIHZhciBtYXRjaGVzID0gbmV3IEFycmF5KHRva2Vucy5sZW5ndGgpXG5cbiAgLy8gQ29tcGlsZSBhbGwgdGhlIHBhdHRlcm5zIGJlZm9yZSBjb21waWxhdGlvbi5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAodHlwZW9mIHRva2Vuc1tpXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIG1hdGNoZXNbaV0gPSBuZXcgUmVnRXhwKCdeKD86JyArIHRva2Vuc1tpXS5wYXR0ZXJuICsgJykkJylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24gKG9iaiwgb3B0cykge1xuICAgIHZhciBwYXRoID0gJydcbiAgICB2YXIgZGF0YSA9IG9iaiB8fCB7fVxuICAgIHZhciBvcHRpb25zID0gb3B0cyB8fCB7fVxuICAgIHZhciBlbmNvZGUgPSBvcHRpb25zLnByZXR0eSA/IGVuY29kZVVSSUNvbXBvbmVudFByZXR0eSA6IGVuY29kZVVSSUNvbXBvbmVudFxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXVxuXG4gICAgICBpZiAodHlwZW9mIHRva2VuID09PSAnc3RyaW5nJykge1xuICAgICAgICBwYXRoICs9IHRva2VuXG5cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgdmFyIHZhbHVlID0gZGF0YVt0b2tlbi5uYW1lXVxuICAgICAgdmFyIHNlZ21lbnRcblxuICAgICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgICAgaWYgKHRva2VuLm9wdGlvbmFsKSB7XG4gICAgICAgICAgLy8gUHJlcGVuZCBwYXJ0aWFsIHNlZ21lbnQgcHJlZml4ZXMuXG4gICAgICAgICAgaWYgKHRva2VuLnBhcnRpYWwpIHtcbiAgICAgICAgICAgIHBhdGggKz0gdG9rZW4ucHJlZml4XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBcIicgKyB0b2tlbi5uYW1lICsgJ1wiIHRvIGJlIGRlZmluZWQnKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChpc2FycmF5KHZhbHVlKSkge1xuICAgICAgICBpZiAoIXRva2VuLnJlcGVhdCkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIFwiJyArIHRva2VuLm5hbWUgKyAnXCIgdG8gbm90IHJlcGVhdCwgYnV0IHJlY2VpdmVkIGAnICsgSlNPTi5zdHJpbmdpZnkodmFsdWUpICsgJ2AnKVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGlmICh0b2tlbi5vcHRpb25hbCkge1xuICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignRXhwZWN0ZWQgXCInICsgdG9rZW4ubmFtZSArICdcIiB0byBub3QgYmUgZW1wdHknKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdmFsdWUubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBzZWdtZW50ID0gZW5jb2RlKHZhbHVlW2pdKVxuXG4gICAgICAgICAgaWYgKCFtYXRjaGVzW2ldLnRlc3Qoc2VnbWVudCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIGFsbCBcIicgKyB0b2tlbi5uYW1lICsgJ1wiIHRvIG1hdGNoIFwiJyArIHRva2VuLnBhdHRlcm4gKyAnXCIsIGJ1dCByZWNlaXZlZCBgJyArIEpTT04uc3RyaW5naWZ5KHNlZ21lbnQpICsgJ2AnKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHBhdGggKz0gKGogPT09IDAgPyB0b2tlbi5wcmVmaXggOiB0b2tlbi5kZWxpbWl0ZXIpICsgc2VnbWVudFxuICAgICAgICB9XG5cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgc2VnbWVudCA9IHRva2VuLmFzdGVyaXNrID8gZW5jb2RlQXN0ZXJpc2sodmFsdWUpIDogZW5jb2RlKHZhbHVlKVxuXG4gICAgICBpZiAoIW1hdGNoZXNbaV0udGVzdChzZWdtZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBcIicgKyB0b2tlbi5uYW1lICsgJ1wiIHRvIG1hdGNoIFwiJyArIHRva2VuLnBhdHRlcm4gKyAnXCIsIGJ1dCByZWNlaXZlZCBcIicgKyBzZWdtZW50ICsgJ1wiJylcbiAgICAgIH1cblxuICAgICAgcGF0aCArPSB0b2tlbi5wcmVmaXggKyBzZWdtZW50XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhdGhcbiAgfVxufVxuXG4vKipcbiAqIEVzY2FwZSBhIHJlZ3VsYXIgZXhwcmVzc2lvbiBzdHJpbmcuXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZXNjYXBlU3RyaW5nIChzdHIpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC8oWy4rKj89XiE6JHt9KClbXFxdfFxcL1xcXFxdKS9nLCAnXFxcXCQxJylcbn1cblxuLyoqXG4gKiBFc2NhcGUgdGhlIGNhcHR1cmluZyBncm91cCBieSBlc2NhcGluZyBzcGVjaWFsIGNoYXJhY3RlcnMgYW5kIG1lYW5pbmcuXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSBncm91cFxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5mdW5jdGlvbiBlc2NhcGVHcm91cCAoZ3JvdXApIHtcbiAgcmV0dXJuIGdyb3VwLnJlcGxhY2UoLyhbPSE6JFxcLygpXSkvZywgJ1xcXFwkMScpXG59XG5cbi8qKlxuICogQXR0YWNoIHRoZSBrZXlzIGFzIGEgcHJvcGVydHkgb2YgdGhlIHJlZ2V4cC5cbiAqXG4gKiBAcGFyYW0gIHshUmVnRXhwfSByZVxuICogQHBhcmFtICB7QXJyYXl9ICAga2V5c1xuICogQHJldHVybiB7IVJlZ0V4cH1cbiAqL1xuZnVuY3Rpb24gYXR0YWNoS2V5cyAocmUsIGtleXMpIHtcbiAgcmUua2V5cyA9IGtleXNcbiAgcmV0dXJuIHJlXG59XG5cbi8qKlxuICogR2V0IHRoZSBmbGFncyBmb3IgYSByZWdleHAgZnJvbSB0aGUgb3B0aW9ucy5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZmxhZ3MgKG9wdGlvbnMpIHtcbiAgcmV0dXJuIG9wdGlvbnMuc2Vuc2l0aXZlID8gJycgOiAnaSdcbn1cblxuLyoqXG4gKiBQdWxsIG91dCBrZXlzIGZyb20gYSByZWdleHAuXG4gKlxuICogQHBhcmFtICB7IVJlZ0V4cH0gcGF0aFxuICogQHBhcmFtICB7IUFycmF5fSAga2V5c1xuICogQHJldHVybiB7IVJlZ0V4cH1cbiAqL1xuZnVuY3Rpb24gcmVnZXhwVG9SZWdleHAgKHBhdGgsIGtleXMpIHtcbiAgLy8gVXNlIGEgbmVnYXRpdmUgbG9va2FoZWFkIHRvIG1hdGNoIG9ubHkgY2FwdHVyaW5nIGdyb3Vwcy5cbiAgdmFyIGdyb3VwcyA9IHBhdGguc291cmNlLm1hdGNoKC9cXCgoPyFcXD8pL2cpXG5cbiAgaWYgKGdyb3Vwcykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZ3JvdXBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBrZXlzLnB1c2goe1xuICAgICAgICBuYW1lOiBpLFxuICAgICAgICBwcmVmaXg6IG51bGwsXG4gICAgICAgIGRlbGltaXRlcjogbnVsbCxcbiAgICAgICAgb3B0aW9uYWw6IGZhbHNlLFxuICAgICAgICByZXBlYXQ6IGZhbHNlLFxuICAgICAgICBwYXJ0aWFsOiBmYWxzZSxcbiAgICAgICAgYXN0ZXJpc2s6IGZhbHNlLFxuICAgICAgICBwYXR0ZXJuOiBudWxsXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBhdHRhY2hLZXlzKHBhdGgsIGtleXMpXG59XG5cbi8qKlxuICogVHJhbnNmb3JtIGFuIGFycmF5IGludG8gYSByZWdleHAuXG4gKlxuICogQHBhcmFtICB7IUFycmF5fSAgcGF0aFxuICogQHBhcmFtICB7QXJyYXl9ICAga2V5c1xuICogQHBhcmFtICB7IU9iamVjdH0gb3B0aW9uc1xuICogQHJldHVybiB7IVJlZ0V4cH1cbiAqL1xuZnVuY3Rpb24gYXJyYXlUb1JlZ2V4cCAocGF0aCwga2V5cywgb3B0aW9ucykge1xuICB2YXIgcGFydHMgPSBbXVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgIHBhcnRzLnB1c2gocGF0aFRvUmVnZXhwKHBhdGhbaV0sIGtleXMsIG9wdGlvbnMpLnNvdXJjZSlcbiAgfVxuXG4gIHZhciByZWdleHAgPSBuZXcgUmVnRXhwKCcoPzonICsgcGFydHMuam9pbignfCcpICsgJyknLCBmbGFncyhvcHRpb25zKSlcblxuICByZXR1cm4gYXR0YWNoS2V5cyhyZWdleHAsIGtleXMpXG59XG5cbi8qKlxuICogQ3JlYXRlIGEgcGF0aCByZWdleHAgZnJvbSBzdHJpbmcgaW5wdXQuXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSAgcGF0aFxuICogQHBhcmFtICB7IUFycmF5fSAga2V5c1xuICogQHBhcmFtICB7IU9iamVjdH0gb3B0aW9uc1xuICogQHJldHVybiB7IVJlZ0V4cH1cbiAqL1xuZnVuY3Rpb24gc3RyaW5nVG9SZWdleHAgKHBhdGgsIGtleXMsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIHRva2Vuc1RvUmVnRXhwKHBhcnNlKHBhdGgsIG9wdGlvbnMpLCBrZXlzLCBvcHRpb25zKVxufVxuXG4vKipcbiAqIEV4cG9zZSBhIGZ1bmN0aW9uIGZvciB0YWtpbmcgdG9rZW5zIGFuZCByZXR1cm5pbmcgYSBSZWdFeHAuXG4gKlxuICogQHBhcmFtICB7IUFycmF5fSAgICAgICAgICB0b2tlbnNcbiAqIEBwYXJhbSAgeyhBcnJheXxPYmplY3QpPX0ga2V5c1xuICogQHBhcmFtICB7T2JqZWN0PX0gICAgICAgICBvcHRpb25zXG4gKiBAcmV0dXJuIHshUmVnRXhwfVxuICovXG5mdW5jdGlvbiB0b2tlbnNUb1JlZ0V4cCAodG9rZW5zLCBrZXlzLCBvcHRpb25zKSB7XG4gIGlmICghaXNhcnJheShrZXlzKSkge1xuICAgIG9wdGlvbnMgPSAvKiogQHR5cGUgeyFPYmplY3R9ICovIChrZXlzIHx8IG9wdGlvbnMpXG4gICAga2V5cyA9IFtdXG4gIH1cblxuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuXG4gIHZhciBzdHJpY3QgPSBvcHRpb25zLnN0cmljdFxuICB2YXIgZW5kID0gb3B0aW9ucy5lbmQgIT09IGZhbHNlXG4gIHZhciByb3V0ZSA9ICcnXG5cbiAgLy8gSXRlcmF0ZSBvdmVyIHRoZSB0b2tlbnMgYW5kIGNyZWF0ZSBvdXIgcmVnZXhwIHN0cmluZy5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgdG9rZW4gPSB0b2tlbnNbaV1cblxuICAgIGlmICh0eXBlb2YgdG9rZW4gPT09ICdzdHJpbmcnKSB7XG4gICAgICByb3V0ZSArPSBlc2NhcGVTdHJpbmcodG9rZW4pXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBwcmVmaXggPSBlc2NhcGVTdHJpbmcodG9rZW4ucHJlZml4KVxuICAgICAgdmFyIGNhcHR1cmUgPSAnKD86JyArIHRva2VuLnBhdHRlcm4gKyAnKSdcblxuICAgICAga2V5cy5wdXNoKHRva2VuKVxuXG4gICAgICBpZiAodG9rZW4ucmVwZWF0KSB7XG4gICAgICAgIGNhcHR1cmUgKz0gJyg/OicgKyBwcmVmaXggKyBjYXB0dXJlICsgJykqJ1xuICAgICAgfVxuXG4gICAgICBpZiAodG9rZW4ub3B0aW9uYWwpIHtcbiAgICAgICAgaWYgKCF0b2tlbi5wYXJ0aWFsKSB7XG4gICAgICAgICAgY2FwdHVyZSA9ICcoPzonICsgcHJlZml4ICsgJygnICsgY2FwdHVyZSArICcpKT8nXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2FwdHVyZSA9IHByZWZpeCArICcoJyArIGNhcHR1cmUgKyAnKT8nXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNhcHR1cmUgPSBwcmVmaXggKyAnKCcgKyBjYXB0dXJlICsgJyknXG4gICAgICB9XG5cbiAgICAgIHJvdXRlICs9IGNhcHR1cmVcbiAgICB9XG4gIH1cblxuICB2YXIgZGVsaW1pdGVyID0gZXNjYXBlU3RyaW5nKG9wdGlvbnMuZGVsaW1pdGVyIHx8ICcvJylcbiAgdmFyIGVuZHNXaXRoRGVsaW1pdGVyID0gcm91dGUuc2xpY2UoLWRlbGltaXRlci5sZW5ndGgpID09PSBkZWxpbWl0ZXJcblxuICAvLyBJbiBub24tc3RyaWN0IG1vZGUgd2UgYWxsb3cgYSBzbGFzaCBhdCB0aGUgZW5kIG9mIG1hdGNoLiBJZiB0aGUgcGF0aCB0b1xuICAvLyBtYXRjaCBhbHJlYWR5IGVuZHMgd2l0aCBhIHNsYXNoLCB3ZSByZW1vdmUgaXQgZm9yIGNvbnNpc3RlbmN5LiBUaGUgc2xhc2hcbiAgLy8gaXMgdmFsaWQgYXQgdGhlIGVuZCBvZiBhIHBhdGggbWF0Y2gsIG5vdCBpbiB0aGUgbWlkZGxlLiBUaGlzIGlzIGltcG9ydGFudFxuICAvLyBpbiBub24tZW5kaW5nIG1vZGUsIHdoZXJlIFwiL3Rlc3QvXCIgc2hvdWxkbid0IG1hdGNoIFwiL3Rlc3QvL3JvdXRlXCIuXG4gIGlmICghc3RyaWN0KSB7XG4gICAgcm91dGUgPSAoZW5kc1dpdGhEZWxpbWl0ZXIgPyByb3V0ZS5zbGljZSgwLCAtZGVsaW1pdGVyLmxlbmd0aCkgOiByb3V0ZSkgKyAnKD86JyArIGRlbGltaXRlciArICcoPz0kKSk/J1xuICB9XG5cbiAgaWYgKGVuZCkge1xuICAgIHJvdXRlICs9ICckJ1xuICB9IGVsc2Uge1xuICAgIC8vIEluIG5vbi1lbmRpbmcgbW9kZSwgd2UgbmVlZCB0aGUgY2FwdHVyaW5nIGdyb3VwcyB0byBtYXRjaCBhcyBtdWNoIGFzXG4gICAgLy8gcG9zc2libGUgYnkgdXNpbmcgYSBwb3NpdGl2ZSBsb29rYWhlYWQgdG8gdGhlIGVuZCBvciBuZXh0IHBhdGggc2VnbWVudC5cbiAgICByb3V0ZSArPSBzdHJpY3QgJiYgZW5kc1dpdGhEZWxpbWl0ZXIgPyAnJyA6ICcoPz0nICsgZGVsaW1pdGVyICsgJ3wkKSdcbiAgfVxuXG4gIHJldHVybiBhdHRhY2hLZXlzKG5ldyBSZWdFeHAoJ14nICsgcm91dGUsIGZsYWdzKG9wdGlvbnMpKSwga2V5cylcbn1cblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIGdpdmVuIHBhdGggc3RyaW5nLCByZXR1cm5pbmcgYSByZWd1bGFyIGV4cHJlc3Npb24uXG4gKlxuICogQW4gZW1wdHkgYXJyYXkgY2FuIGJlIHBhc3NlZCBpbiBmb3IgdGhlIGtleXMsIHdoaWNoIHdpbGwgaG9sZCB0aGVcbiAqIHBsYWNlaG9sZGVyIGtleSBkZXNjcmlwdGlvbnMuIEZvciBleGFtcGxlLCB1c2luZyBgL3VzZXIvOmlkYCwgYGtleXNgIHdpbGxcbiAqIGNvbnRhaW4gYFt7IG5hbWU6ICdpZCcsIGRlbGltaXRlcjogJy8nLCBvcHRpb25hbDogZmFsc2UsIHJlcGVhdDogZmFsc2UgfV1gLlxuICpcbiAqIEBwYXJhbSAgeyhzdHJpbmd8UmVnRXhwfEFycmF5KX0gcGF0aFxuICogQHBhcmFtICB7KEFycmF5fE9iamVjdCk9fSAgICAgICBrZXlzXG4gKiBAcGFyYW0gIHtPYmplY3Q9fSAgICAgICAgICAgICAgIG9wdGlvbnNcbiAqIEByZXR1cm4geyFSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIHBhdGhUb1JlZ2V4cCAocGF0aCwga2V5cywgb3B0aW9ucykge1xuICBpZiAoIWlzYXJyYXkoa2V5cykpIHtcbiAgICBvcHRpb25zID0gLyoqIEB0eXBlIHshT2JqZWN0fSAqLyAoa2V5cyB8fCBvcHRpb25zKVxuICAgIGtleXMgPSBbXVxuICB9XG5cbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cblxuICBpZiAocGF0aCBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgIHJldHVybiByZWdleHBUb1JlZ2V4cChwYXRoLCAvKiogQHR5cGUgeyFBcnJheX0gKi8gKGtleXMpKVxuICB9XG5cbiAgaWYgKGlzYXJyYXkocGF0aCkpIHtcbiAgICByZXR1cm4gYXJyYXlUb1JlZ2V4cCgvKiogQHR5cGUgeyFBcnJheX0gKi8gKHBhdGgpLCAvKiogQHR5cGUgeyFBcnJheX0gKi8gKGtleXMpLCBvcHRpb25zKVxuICB9XG5cbiAgcmV0dXJuIHN0cmluZ1RvUmVnZXhwKC8qKiBAdHlwZSB7c3RyaW5nfSAqLyAocGF0aCksIC8qKiBAdHlwZSB7IUFycmF5fSAqLyAoa2V5cyksIG9wdGlvbnMpXG59XG4iLCJjbGFzcyBMb2d7XG4gICAgY29uc3RydWN0b3IobmFtZSl7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgfVxuICAgIHcobXNnKXtcbiAgICAgICAgY29uc29sZS53YXJuKFxuYFske3RoaXMubmFtZX1dPT09PT4gJHtuZXcgRGF0ZSgpLnRvVGltZVN0cmluZygpfVxuICAgICAgICAgICAgICA6ICR7bXNnfWBcbiAgICAgICAgICAgICAgKTtcbiAgICB9XG4gICAgbChtc2cpe1xuICAgICAgICBjb25zb2xlLmxvZyhcbmBbJHt0aGlzLm5hbWV9XT09PT0+ICR7bmV3IERhdGUoKS50b1RpbWVTdHJpbmcoKX1cbiAgICAgICAgICAgICAgOiAke21zZ31gXG4gICAgICAgICAgICAgICk7ICAgICAgXG4gICAgfVxuICAgIGUobXNnKXtcbiAgICAgICAgY29uc29sZS5lcnJvcihcbmBbJHt0aGlzLm5hbWV9XT09PT0+ICR7bmV3IERhdGUoKS50b1RpbWVTdHJpbmcoKX1cbiAgICAgICAgICAgICAgOiAke21zZ31gXG4gICAgICAgICAgICAgICk7ICAgICBcbiAgICB9XG4gICAgaShtc2cpe1xuICAgICAgICBjb25zb2xlLmluZm8oXG5gWyR7dGhpcy5uYW1lfV09PT09PiAke25ldyBEYXRlKCkudG9UaW1lU3RyaW5nKCl9XG4gICAgICAgICAgICAgIDogJHttc2d9YFxuICAgICAgICAgICAgICApOyAgICBcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IExvZzsiLCJpbXBvcnQgcGF0aHRvUmVnZXhwIGZyb20gJy4uL2xpYi9wYXRoLXRvLXJlZ2V4cCc7XG5pbXBvcnQgTG9nIGZyb20gJy4uL2xpYi9sb2cnO1xuXG5jb25zdCBsb2cgPSBuZXcgTG9nKCd3ZWItc2VydmljZS1yb3V0ZXInKTtcblxuLyoqXG4gKiBtZXRob2QgbWF0Y2ggcnVsZTpcbiAqICAwOiBhbGxcbiAqICAxOiBnZXRcbiAqICAyOiBwb3N0XG4gKiAgMzogcGF0Y2hcbiAqICA0OiBwdXRcbiAqL1xuXG5jbGFzcyBSb3V0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvLyBub29wXG5cbiAgICAvKipcbiAgICAgKiBzYXZlIHJlZ2lzdGVyZWQgcm91dGVzXG4gICAgICogIGZvcm1hdDogW21ldGhvZCx1cmxzLGNiXVxuICAgICAqICAgIEBtZXRob2Qge051bWJlcn1cbiAgICAgKiAgICBAdXJscyB7QXJyYXl9XG4gICAgICogICAgQGNiIHtGdW5jdGlvbn1cbiAgICAgKi9cbiAgICB0aGlzLl9yb3V0ZXMgPSBbXTtcbiAgICB0aGlzLl9yZXF1ZXN0OyAvLyBzYXZlIHRoZSByb3V0ZVxuICB9XG4gIC8vIGluaXRpYWxseSBjYWxsIGB3YXRjaGAgZnVuY3Rpb25cbiAgd2F0Y2gocmVxdWVzdCkge1xuICAgIC8vIGNoZWNrIHRoZSB0eXBlIG9mIHVybFxuICAgIGlmICghdGhpcy5fZXh0cmFjdChyZXF1ZXN0KSlcbiAgICAgIHJldHVybjtcblxuICAgIGxldCB7XG4gICAgICBtZXRob2QsXG4gICAgICB1cmxcbiAgICB9ID0gdGhpcy5fcmVxdWVzdDtcblxuICAgIHVybCA9IHRoaXNcbiAgICAgIC5fcmVzb2x2ZSh1cmwpXG4gICAgICAucGF0aG5hbWU7XG4gICAgbWV0aG9kID0gdGhpcy5fbWV0aG9kTWF0Y2gobWV0aG9kLnRvTG93ZXJDYXNlKCkpO1xuXG4gICAgdmFyIHRlbXBBcnIgPSB0aGlzXG4gICAgICAuX3JvdXRlc1xuICAgICAgLmZpbHRlcihyb3V0ZSA9PiB7XG4gICAgICAgIHJldHVybiByb3V0ZVswXSA9PT0gbWV0aG9kXG4gICAgICB9KTtcblxuICAgIGxldCBmbGFnID0gZmFsc2U7XG4gICAgZm9yICh2YXIgcm91dGUgb2YgdGVtcEFycikge1xuICAgICAgbGV0IHVybHMgPSByb3V0ZVsxXTtcbiAgICAgIGZvciAodmFyIGRlc3RVcmwgb2YgdXJscykge1xuICAgICAgICBpZiAoISFwYXRodG9SZWdleHAoZGVzdFVybCkuZXhlYyh1cmwpKSB7XG4gICAgICAgICAgZmxhZyA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCFmbGFnKVxuICAgICAgICBjb250aW51ZTtcblxuICAgICAgcm91dGVbMl0odGhpcy5fZXZlbnQsIHRoaXMuX3JlcXVlc3QpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIF9leHRyYWN0KGV2ZW50KSB7XG4gICAgLy8gb25seSBhY2NlcHQgJ2V2ZW50J1xuICAgIGlmICh0aGlzLl9nZXRUeXBlKGV2ZW50KSAhPT0gJ2ZldGNoZXZlbnQnKSB7XG4gICAgICBsb2cuZSgnd2F0Y2goZXZlbnQpIG9ubHkgYWNjZXB0IDxldmVudD4gcGFyYW0gZnJvbSBmZXRjaCBjYWxsYmFjaycpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICB0aGlzLl9yZXF1ZXN0ID0gZXZlbnQucmVxdWVzdDtcbiAgICB0aGlzLl9ldmVudCA9IGV2ZW50O1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIF9nZXRUeXBlKG9iaikge1xuICAgIHJldHVybiBPYmplY3RcbiAgICAgIC5wcm90b3R5cGVcbiAgICAgIC50b1N0cmluZ1xuICAgICAgLmNhbGwob2JqKVxuICAgICAgLm1hdGNoKC9cXHMoW2EtekEtWl0rKS8pWzFdXG4gICAgICAudG9Mb3dlckNhc2UoKTtcbiAgfVxuICBfcmVzb2x2ZShocmVmKSB7XG4gICAgcmV0dXJuIG5ldyBVUkwoaHJlZik7XG4gIH1cbiAgX3VybERCKHVybHMsIGNiLCBtZXRob2QgPSAwKSB7XG4gICAgdGhpc1xuICAgICAgLl9yb3V0ZXNcbiAgICAgIC5wdXNoKFttZXRob2QsIHVybHMsIGNiXSk7XG4gIH1cbiAgX21ldGhvZE1hdGNoKG5hbWUpIHtcbiAgICBzd2l0Y2ggKG5hbWUpIHtcbiAgICAgIGNhc2UgJ2FsbCc6XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgY2FzZSAnZ2V0JzpcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgICBjYXNlICdwb3N0JzpcbiAgICAgICAgcmV0dXJuIDI7XG4gICAgICBjYXNlICdwYXRjaCc6XG4gICAgICAgIHJldHVybiAzO1xuICAgICAgY2FzZSAncHV0JzpcbiAgICAgICAgcmV0dXJuIDQ7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG4gIH1cbiAgX3BhcmFtUmVzb2x2ZShwYXJhbXMsIG1ldGhvZCA9ICdnZXQnKSB7XG4gICAgaWYgKHBhcmFtcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGxvZy5lKCd0aGUgcGFyYW0gb2Ygcm91dGUgaXMgZW1wdHknKVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBjaGVjayB0aGUgbGFzdCBwYXJhbSBpcyBjYWxsYmFja1xuICAgIGxldCBjYiA9IHBhcmFtcy5wb3AoKTtcbiAgICBpZiAodGhpcy5fZ2V0VHlwZShjYikgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGxvZy5lKFwidGhlIHR5cGUgb2YgY2FsbGJhY2sgaXMgaW5jb3JyZWN0LCB5b3VyIGNiIGlzIFwiICsgY2IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIHNhdmUgdXJsc1xuICAgIGxldCByb3V0ZXMgPSBbXTtcbiAgICBwYXJhbXMuZm9yRWFjaCh1cmwgPT4ge1xuICAgICAgaWYgKHRoaXMuX2dldFR5cGUodXJsKSA9PT0gJ2FycmF5Jykge1xuICAgICAgICByb3V0ZXMgPSB1cmw7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuX2dldFR5cGUodXJsKSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcm91dGVzLnB1c2godXJsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nLmUoXCJ0aGUgdXJscyBvZiBnZXQodXJscykgc2hvdWxkIG9ubHkgYmUgYXJyYXkgb3Igc3RyaW5nLiBsaWtlICcvcGF0aCcgfHwgWycvcGF0aCcsJ1wiICtcbiAgICAgICAgICBcIi9kZW1vJ11cIik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBtZXRob2QgPSB0aGlzLl9tZXRob2RNYXRjaChtZXRob2QpO1xuICAgIHRoaXMuX3VybERCKHJvdXRlcywgY2IsIG1ldGhvZCk7XG4gIH1cbiAgZ2V0KC4uLnBhcmFtcykge1xuICAgIHRoaXMuX3BhcmFtUmVzb2x2ZShwYXJhbXMsICdnZXQnKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICBwb3N0KC4uLnBhcmFtcykge1xuICAgIHRoaXMuX3BhcmFtUmVzb2x2ZShwYXJhbXMsICdwb3N0Jyk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiAgcGF0Y2goLi4ucGFyYW1zKSB7XG4gICAgdGhpcy5fcGFyYW1SZXNvbHZlKHBhcmFtcywgJ3BhdGNoJyk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiAgcHV0KC4uLnBhcmFtcykge1xuICAgIHRoaXMuX3BhcmFtUmVzb2x2ZShwYXJhbXMsICdwdXQnKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICBhbGwoLi4ucGFyYW1zKSB7XG4gICAgdGhpcy5fcGFyYW1SZXNvbHZlKHBhcmFtcywgJ2FsbCcpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG4gIHNhdmUoY2FjaGVOYW1lLCBldmVudCkge1xuICAgIGlmIChldmVudCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBldmVudCA9IGNhY2hlTmFtZTtcbiAgICAgIGNhY2hlTmFtZSA9ICdkZWZhdWx0TmFtZSc7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2dldFR5cGUoZXZlbnQpICE9PSAnZmV0Y2hldmVudCcpIHtcbiAgICAgIC8vIGNoZWNrIGZldGNoZXZlbnRcbiAgICAgIGxvZy5lKCd0aGUgcGFyYW0gWycgKyB0aGlzLl9nZXRUeXBlKGV2ZW50KSArICddIG9mIHNhdmUgaXMgd3JvbmcnICtcbiAgICAgICAgJy9uJyArXG4gICAgICAgICdpdCBvbmx5IGFjY3BldCBbZXZlbnRdJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgcmVxdWVzdCA9IGV2ZW50LnJlcXVlc3Q7XG4gICAgZXZlbnQucmVzcG9uZFdpdGgoY2FjaGVzLm1hdGNoKHJlcXVlc3QpLnRoZW4ocmVzID0+IHtcbiAgICAgIGlmIChyZXMpXG4gICAgICAgIHJldHVybiByZXM7XG5cbiAgICAgIGxldCByZXFDbG9uZSA9IHJlcXVlc3QuY2xvbmUoKTtcblxuICAgICAgcmV0dXJuIGZldGNoKHJlcXVlc3QpLnRoZW4ocmVzID0+IHtcbiAgICAgICAgLy8gZmFpbGVkXG4gICAgICAgIGlmICghcmVzIHx8IHJlcy5zdGF0dXMgIT09IDIwMCB8fCByZXMudHlwZSAhPT0gJ2Jhc2ljJykge1xuICAgICAgICAgIHJldHVybiByZXM7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcmVzQ2xvbmUgPSByZXMuY2xvbmUoKTtcblxuICAgICAgICBjYWNoZXNcbiAgICAgICAgICAub3BlbihjYWNoZU5hbWUpXG4gICAgICAgICAgLnRoZW4oY2FjaGUgPT4ge1xuICAgICAgICAgICAgY2FjaGUucHV0KHJlcUNsb25lLCByZXNDbG9uZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXM7XG4gICAgICB9KVxuICAgIH0pKVxuICB9XG59XG5cbnNlbGYuUm91dGVyID0gbmV3IFJvdXRlcigpO1xuXG4vKipcbiAqIHRyaWdnZXIgbWV0aG9kIGlzIFJvdXRlci53YXRjaChldmVudCBvciByZXF1ZXN0IG9yIHN0cmluZylcbiAqL1xuXG5cbi8qKlxuICogdGhlIGNhbGxpbmcgd2F5czpcbiAqICBnZXQoJy9wYXRoJywnL2RlbW8nLGNiKSBvclxuICogIGdldChbJy9wYXRoJywnL2RlbW8nXSxjYikgb3JcbiAqICBnZXQoJy9wYXRoJyxjYikgIG9ubHkgb25lIHJvdXRlXG4gKi9cbiJdLCJuYW1lcyI6WyJpc2FycmF5IiwiQXJyYXkiLCJpc0FycmF5IiwiYXJyIiwiT2JqZWN0IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiUEFUSF9SRUdFWFAiLCJSZWdFeHAiLCJqb2luIiwicGFyc2UiLCJzdHIiLCJvcHRpb25zIiwidG9rZW5zIiwia2V5IiwiaW5kZXgiLCJwYXRoIiwiZGVmYXVsdERlbGltaXRlciIsImRlbGltaXRlciIsInJlcyIsImV4ZWMiLCJtIiwiZXNjYXBlZCIsIm9mZnNldCIsInNsaWNlIiwibGVuZ3RoIiwibmV4dCIsInByZWZpeCIsIm5hbWUiLCJjYXB0dXJlIiwiZ3JvdXAiLCJtb2RpZmllciIsImFzdGVyaXNrIiwicHVzaCIsInBhcnRpYWwiLCJyZXBlYXQiLCJvcHRpb25hbCIsInBhdHRlcm4iLCJlc2NhcGVHcm91cCIsImVzY2FwZVN0cmluZyIsInN1YnN0ciIsInJlcGxhY2UiLCJhdHRhY2hLZXlzIiwicmUiLCJrZXlzIiwiZmxhZ3MiLCJzZW5zaXRpdmUiLCJyZWdleHBUb1JlZ2V4cCIsImdyb3VwcyIsInNvdXJjZSIsIm1hdGNoIiwiaSIsImFycmF5VG9SZWdleHAiLCJwYXJ0cyIsInBhdGhUb1JlZ2V4cCIsInJlZ2V4cCIsInN0cmluZ1RvUmVnZXhwIiwidG9rZW5zVG9SZWdFeHAiLCJzdHJpY3QiLCJlbmQiLCJyb3V0ZSIsInRva2VuIiwiZW5kc1dpdGhEZWxpbWl0ZXIiLCJMb2ciLCJtc2ciLCJ3YXJuIiwiRGF0ZSIsInRvVGltZVN0cmluZyIsImxvZyIsImVycm9yIiwiaW5mbyIsIlJvdXRlciIsIl9yb3V0ZXMiLCJfcmVxdWVzdCIsInJlcXVlc3QiLCJfZXh0cmFjdCIsIm1ldGhvZCIsInVybCIsIl9yZXNvbHZlIiwicGF0aG5hbWUiLCJfbWV0aG9kTWF0Y2giLCJ0b0xvd2VyQ2FzZSIsInRlbXBBcnIiLCJmaWx0ZXIiLCJmbGFnIiwidXJscyIsImRlc3RVcmwiLCJwYXRodG9SZWdleHAiLCJfZXZlbnQiLCJldmVudCIsIl9nZXRUeXBlIiwiZSIsIm9iaiIsImhyZWYiLCJVUkwiLCJjYiIsInBhcmFtcyIsInBvcCIsInJvdXRlcyIsImZvckVhY2giLCJfdXJsREIiLCJfcGFyYW1SZXNvbHZlIiwiY2FjaGVOYW1lIiwidW5kZWZpbmVkIiwicmVzcG9uZFdpdGgiLCJjYWNoZXMiLCJ0aGVuIiwicmVxQ2xvbmUiLCJjbG9uZSIsImZldGNoIiwic3RhdHVzIiwidHlwZSIsInJlc0Nsb25lIiwib3BlbiIsInB1dCIsInNlbGYiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLElBQUlBLFVBQVVDLE1BQU1DLE9BQU4sSUFBaUIsVUFBVUMsR0FBVixFQUFlO1NBQ3JDQyxPQUFPQyxTQUFQLENBQWlCQyxRQUFqQixDQUEwQkMsSUFBMUIsQ0FBK0JKLEdBQS9CLEtBQXVDLGdCQUE5QztDQURGOztBQUlBLEFBVUEsQUFFQTs7Ozs7QUFLQSxJQUFJSyxjQUFjLElBQUlDLE1BQUosQ0FBVzs7O0FBRzNCLFNBSDJCOzs7Ozs7O0FBVTNCLHdHQVYyQixFQVczQkMsSUFYMkIsQ0FXdEIsR0FYc0IsQ0FBWCxFQVdMLEdBWEssQ0FBbEI7Ozs7Ozs7OztBQW9CQSxTQUFTQyxLQUFULENBQWdCQyxHQUFoQixFQUFxQkMsT0FBckIsRUFBOEI7TUFDeEJDLFNBQVMsRUFBYjtNQUNJQyxNQUFNLENBQVY7TUFDSUMsUUFBUSxDQUFaO01BQ0lDLE9BQU8sRUFBWDtNQUNJQyxtQkFBbUJMLFdBQVdBLFFBQVFNLFNBQW5CLElBQWdDLEdBQXZEO01BQ0lDLEdBQUo7O1NBRU8sQ0FBQ0EsTUFBTVosWUFBWWEsSUFBWixDQUFpQlQsR0FBakIsQ0FBUCxLQUFpQyxJQUF4QyxFQUE4QztRQUN4Q1UsSUFBSUYsSUFBSSxDQUFKLENBQVI7UUFDSUcsVUFBVUgsSUFBSSxDQUFKLENBQWQ7UUFDSUksU0FBU0osSUFBSUosS0FBakI7WUFDUUosSUFBSWEsS0FBSixDQUFVVCxLQUFWLEVBQWlCUSxNQUFqQixDQUFSO1lBQ1FBLFNBQVNGLEVBQUVJLE1BQW5COzs7UUFHSUgsT0FBSixFQUFhO2NBQ0hBLFFBQVEsQ0FBUixDQUFSOzs7O1FBSUVJLE9BQU9mLElBQUlJLEtBQUosQ0FBWDtRQUNJWSxTQUFTUixJQUFJLENBQUosQ0FBYjtRQUNJUyxPQUFPVCxJQUFJLENBQUosQ0FBWDtRQUNJVSxVQUFVVixJQUFJLENBQUosQ0FBZDtRQUNJVyxRQUFRWCxJQUFJLENBQUosQ0FBWjtRQUNJWSxXQUFXWixJQUFJLENBQUosQ0FBZjtRQUNJYSxXQUFXYixJQUFJLENBQUosQ0FBZjs7O1FBR0lILElBQUosRUFBVTthQUNEaUIsSUFBUCxDQUFZakIsSUFBWjthQUNPLEVBQVA7OztRQUdFa0IsVUFBVVAsVUFBVSxJQUFWLElBQWtCRCxRQUFRLElBQTFCLElBQWtDQSxTQUFTQyxNQUF6RDtRQUNJUSxTQUFTSixhQUFhLEdBQWIsSUFBb0JBLGFBQWEsR0FBOUM7UUFDSUssV0FBV0wsYUFBYSxHQUFiLElBQW9CQSxhQUFhLEdBQWhEO1FBQ0liLFlBQVlDLElBQUksQ0FBSixLQUFVRixnQkFBMUI7UUFDSW9CLFVBQVVSLFdBQVdDLEtBQXpCOztXQUVPRyxJQUFQLENBQVk7WUFDSkwsUUFBUWQsS0FESjtjQUVGYSxVQUFVLEVBRlI7aUJBR0NULFNBSEQ7Z0JBSUFrQixRQUpBO2NBS0ZELE1BTEU7ZUFNREQsT0FOQztnQkFPQSxDQUFDLENBQUNGLFFBUEY7ZUFRREssVUFBVUMsWUFBWUQsT0FBWixDQUFWLEdBQWtDTCxXQUFXLElBQVgsR0FBa0IsT0FBT08sYUFBYXJCLFNBQWIsQ0FBUCxHQUFpQztLQVJoRzs7OztNQWFFSCxRQUFRSixJQUFJYyxNQUFoQixFQUF3QjtZQUNkZCxJQUFJNkIsTUFBSixDQUFXekIsS0FBWCxDQUFSOzs7O01BSUVDLElBQUosRUFBVTtXQUNEaUIsSUFBUCxDQUFZakIsSUFBWjs7O1NBR0tILE1BQVA7OztBQUdGLEFBV0EsQUFZQSxBQVlBLEFBb0ZBOzs7Ozs7QUFNQSxTQUFTMEIsWUFBVCxDQUF1QjVCLEdBQXZCLEVBQTRCO1NBQ25CQSxJQUFJOEIsT0FBSixDQUFZLDRCQUFaLEVBQTBDLE1BQTFDLENBQVA7Ozs7Ozs7OztBQVNGLFNBQVNILFdBQVQsQ0FBc0JSLEtBQXRCLEVBQTZCO1NBQ3BCQSxNQUFNVyxPQUFOLENBQWMsZUFBZCxFQUErQixNQUEvQixDQUFQOzs7Ozs7Ozs7O0FBVUYsU0FBU0MsVUFBVCxDQUFxQkMsRUFBckIsRUFBeUJDLElBQXpCLEVBQStCO0tBQzFCQSxJQUFILEdBQVVBLElBQVY7U0FDT0QsRUFBUDs7Ozs7Ozs7O0FBU0YsU0FBU0UsS0FBVCxDQUFnQmpDLE9BQWhCLEVBQXlCO1NBQ2hCQSxRQUFRa0MsU0FBUixHQUFvQixFQUFwQixHQUF5QixHQUFoQzs7Ozs7Ozs7OztBQVVGLFNBQVNDLGNBQVQsQ0FBeUIvQixJQUF6QixFQUErQjRCLElBQS9CLEVBQXFDOztNQUUvQkksU0FBU2hDLEtBQUtpQyxNQUFMLENBQVlDLEtBQVosQ0FBa0IsV0FBbEIsQ0FBYjs7TUFFSUYsTUFBSixFQUFZO1NBQ0wsSUFBSUcsSUFBSSxDQUFiLEVBQWdCQSxJQUFJSCxPQUFPdkIsTUFBM0IsRUFBbUMwQixHQUFuQyxFQUF3QztXQUNqQ2xCLElBQUwsQ0FBVTtjQUNGa0IsQ0FERTtnQkFFQSxJQUZBO21CQUdHLElBSEg7a0JBSUUsS0FKRjtnQkFLQSxLQUxBO2lCQU1DLEtBTkQ7a0JBT0UsS0FQRjtpQkFRQztPQVJYOzs7O1NBYUdULFdBQVcxQixJQUFYLEVBQWlCNEIsSUFBakIsQ0FBUDs7Ozs7Ozs7Ozs7QUFXRixTQUFTUSxhQUFULENBQXdCcEMsSUFBeEIsRUFBOEI0QixJQUE5QixFQUFvQ2hDLE9BQXBDLEVBQTZDO01BQ3ZDeUMsUUFBUSxFQUFaOztPQUVLLElBQUlGLElBQUksQ0FBYixFQUFnQkEsSUFBSW5DLEtBQUtTLE1BQXpCLEVBQWlDMEIsR0FBakMsRUFBc0M7VUFDOUJsQixJQUFOLENBQVdxQixhQUFhdEMsS0FBS21DLENBQUwsQ0FBYixFQUFzQlAsSUFBdEIsRUFBNEJoQyxPQUE1QixFQUFxQ3FDLE1BQWhEOzs7TUFHRU0sU0FBUyxJQUFJL0MsTUFBSixDQUFXLFFBQVE2QyxNQUFNNUMsSUFBTixDQUFXLEdBQVgsQ0FBUixHQUEwQixHQUFyQyxFQUEwQ29DLE1BQU1qQyxPQUFOLENBQTFDLENBQWI7O1NBRU84QixXQUFXYSxNQUFYLEVBQW1CWCxJQUFuQixDQUFQOzs7Ozs7Ozs7OztBQVdGLFNBQVNZLGNBQVQsQ0FBeUJ4QyxJQUF6QixFQUErQjRCLElBQS9CLEVBQXFDaEMsT0FBckMsRUFBOEM7U0FDckM2QyxlQUFlL0MsTUFBTU0sSUFBTixFQUFZSixPQUFaLENBQWYsRUFBcUNnQyxJQUFyQyxFQUEyQ2hDLE9BQTNDLENBQVA7Ozs7Ozs7Ozs7O0FBV0YsU0FBUzZDLGNBQVQsQ0FBeUI1QyxNQUF6QixFQUFpQytCLElBQWpDLEVBQXVDaEMsT0FBdkMsRUFBZ0Q7TUFDMUMsQ0FBQ2IsUUFBUTZDLElBQVIsQ0FBTCxFQUFvQjtvQ0FDZ0JBLFFBQVFoQyxPQUExQztXQUNPLEVBQVA7OztZQUdRQSxXQUFXLEVBQXJCOztNQUVJOEMsU0FBUzlDLFFBQVE4QyxNQUFyQjtNQUNJQyxNQUFNL0MsUUFBUStDLEdBQVIsS0FBZ0IsS0FBMUI7TUFDSUMsUUFBUSxFQUFaOzs7T0FHSyxJQUFJVCxJQUFJLENBQWIsRUFBZ0JBLElBQUl0QyxPQUFPWSxNQUEzQixFQUFtQzBCLEdBQW5DLEVBQXdDO1FBQ2xDVSxRQUFRaEQsT0FBT3NDLENBQVAsQ0FBWjs7UUFFSSxPQUFPVSxLQUFQLEtBQWlCLFFBQXJCLEVBQStCO2VBQ3BCdEIsYUFBYXNCLEtBQWIsQ0FBVDtLQURGLE1BRU87VUFDRGxDLFNBQVNZLGFBQWFzQixNQUFNbEMsTUFBbkIsQ0FBYjtVQUNJRSxVQUFVLFFBQVFnQyxNQUFNeEIsT0FBZCxHQUF3QixHQUF0Qzs7V0FFS0osSUFBTCxDQUFVNEIsS0FBVjs7VUFFSUEsTUFBTTFCLE1BQVYsRUFBa0I7bUJBQ0wsUUFBUVIsTUFBUixHQUFpQkUsT0FBakIsR0FBMkIsSUFBdEM7OztVQUdFZ0MsTUFBTXpCLFFBQVYsRUFBb0I7WUFDZCxDQUFDeUIsTUFBTTNCLE9BQVgsRUFBb0I7b0JBQ1IsUUFBUVAsTUFBUixHQUFpQixHQUFqQixHQUF1QkUsT0FBdkIsR0FBaUMsS0FBM0M7U0FERixNQUVPO29CQUNLRixTQUFTLEdBQVQsR0FBZUUsT0FBZixHQUF5QixJQUFuQzs7T0FKSixNQU1PO2tCQUNLRixTQUFTLEdBQVQsR0FBZUUsT0FBZixHQUF5QixHQUFuQzs7O2VBR09BLE9BQVQ7Ozs7TUFJQVgsWUFBWXFCLGFBQWEzQixRQUFRTSxTQUFSLElBQXFCLEdBQWxDLENBQWhCO01BQ0k0QyxvQkFBb0JGLE1BQU1wQyxLQUFOLENBQVksQ0FBQ04sVUFBVU8sTUFBdkIsTUFBbUNQLFNBQTNEOzs7Ozs7TUFNSSxDQUFDd0MsTUFBTCxFQUFhO1lBQ0gsQ0FBQ0ksb0JBQW9CRixNQUFNcEMsS0FBTixDQUFZLENBQVosRUFBZSxDQUFDTixVQUFVTyxNQUExQixDQUFwQixHQUF3RG1DLEtBQXpELElBQWtFLEtBQWxFLEdBQTBFMUMsU0FBMUUsR0FBc0YsU0FBOUY7OztNQUdFeUMsR0FBSixFQUFTO2FBQ0UsR0FBVDtHQURGLE1BRU87OzthQUdJRCxVQUFVSSxpQkFBVixHQUE4QixFQUE5QixHQUFtQyxRQUFRNUMsU0FBUixHQUFvQixLQUFoRTs7O1NBR0t3QixXQUFXLElBQUlsQyxNQUFKLENBQVcsTUFBTW9ELEtBQWpCLEVBQXdCZixNQUFNakMsT0FBTixDQUF4QixDQUFYLEVBQW9EZ0MsSUFBcEQsQ0FBUDs7Ozs7Ozs7Ozs7Ozs7O0FBZUYsU0FBU1UsWUFBVCxDQUF1QnRDLElBQXZCLEVBQTZCNEIsSUFBN0IsRUFBbUNoQyxPQUFuQyxFQUE0QztNQUN0QyxDQUFDYixRQUFRNkMsSUFBUixDQUFMLEVBQW9CO29DQUNnQkEsUUFBUWhDLE9BQTFDO1dBQ08sRUFBUDs7O1lBR1FBLFdBQVcsRUFBckI7O01BRUlJLGdCQUFnQlIsTUFBcEIsRUFBNEI7V0FDbkJ1QyxlQUFlL0IsSUFBZix1QkFBNEM0QixJQUE1QyxDQUFQOzs7TUFHRTdDLFFBQVFpQixJQUFSLENBQUosRUFBbUI7V0FDVm9DLG9DQUFxQ3BDLElBQXJDLHVCQUFtRTRCLElBQW5FLEVBQTBFaEMsT0FBMUUsQ0FBUDs7O1NBR0s0QyxxQ0FBc0N4QyxJQUF0Qyx1QkFBb0U0QixJQUFwRSxFQUEyRWhDLE9BQTNFLENBQVA7OztJQzdhSW1EO2lCQUNVbkMsSUFBWixFQUFpQjs7O2FBQ1JBLElBQUwsR0FBWUEsSUFBWjs7Ozs7MEJBRUZvQyxLQUFJO29CQUNNQyxJQUFSLE9BQ0osS0FBS3JDLElBREQsZUFDZSxJQUFJc0MsSUFBSixHQUFXQyxZQUFYLEVBRGYsMEJBRVVILEdBRlY7Ozs7MEJBS0ZBLEtBQUk7b0JBQ01JLEdBQVIsT0FDSixLQUFLeEMsSUFERCxlQUNlLElBQUlzQyxJQUFKLEdBQVdDLFlBQVgsRUFEZiwwQkFFVUgsR0FGVjs7OzswQkFLRkEsS0FBSTtvQkFDTUssS0FBUixPQUNKLEtBQUt6QyxJQURELGVBQ2UsSUFBSXNDLElBQUosR0FBV0MsWUFBWCxFQURmLDBCQUVVSCxHQUZWOzs7OzBCQUtGQSxLQUFJO29CQUNNTSxJQUFSLE9BQ0osS0FBSzFDLElBREQsZUFDZSxJQUFJc0MsSUFBSixHQUFXQyxZQUFYLEVBRGYsMEJBRVVILEdBRlY7Ozs7SUFPUjs7QUMzQkEsSUFBTUksTUFBTSxJQUFJTCxHQUFKLENBQVEsb0JBQVIsQ0FBWjs7Ozs7Ozs7Ozs7SUFXTVE7b0JBQ1U7Ozs7Ozs7Ozs7OztTQVVQQyxPQUFMLEdBQWUsRUFBZjtTQUNLQyxRQUFMLENBWFk7Ozs7Ozs7MEJBY1JDLFNBQVM7O1VBRVQsQ0FBQyxLQUFLQyxRQUFMLENBQWNELE9BQWQsQ0FBTCxFQUNFOztxQkFLRSxLQUFLRCxRQVJJO1VBTVhHLE1BTlcsWUFNWEEsTUFOVztVQU9YQyxHQVBXLFlBT1hBLEdBUFc7OztZQVVQLEtBQ0hDLFFBREcsQ0FDTUQsR0FETixFQUVIRSxRQUZIO2VBR1MsS0FBS0MsWUFBTCxDQUFrQkosT0FBT0ssV0FBUCxFQUFsQixDQUFUOztVQUVJQyxVQUFVLEtBQ1hWLE9BRFcsQ0FFWFcsTUFGVyxDQUVKLGlCQUFTO2VBQ1J2QixNQUFNLENBQU4sTUFBYWdCLE1BQXBCO09BSFUsQ0FBZDs7VUFNSVEsT0FBTyxLQUFYOzs7Ozs7NkJBQ2tCRixPQUFsQiw4SEFBMkI7Y0FBbEJ0QixLQUFrQjs7Y0FDckJ5QixPQUFPekIsTUFBTSxDQUFOLENBQVg7Ozs7OztrQ0FDb0J5QixJQUFwQixtSUFBMEI7a0JBQWpCQyxPQUFpQjs7a0JBQ3BCLENBQUMsQ0FBQ0MsYUFBYUQsT0FBYixFQUFzQmxFLElBQXRCLENBQTJCeUQsR0FBM0IsQ0FBTixFQUF1Qzt1QkFDOUIsSUFBUDs7Ozs7Ozs7Ozs7Ozs7Ozs7OztjQUtBLENBQUNPLElBQUwsRUFDRTs7Z0JBRUksQ0FBTixFQUFTLEtBQUtJLE1BQWQsRUFBc0IsS0FBS2YsUUFBM0I7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzZCQUlLZ0IsT0FBTzs7VUFFVixLQUFLQyxRQUFMLENBQWNELEtBQWQsTUFBeUIsWUFBN0IsRUFBMkM7WUFDckNFLENBQUosQ0FBTSw0REFBTjtlQUNPLEtBQVA7O1dBRUdsQixRQUFMLEdBQWdCZ0IsTUFBTWYsT0FBdEI7V0FDS2MsTUFBTCxHQUFjQyxLQUFkO2FBQ08sSUFBUDs7Ozs2QkFFT0csS0FBSzthQUNMekYsT0FDSkMsU0FESSxDQUVKQyxRQUZJLENBR0pDLElBSEksQ0FHQ3NGLEdBSEQsRUFJSjFDLEtBSkksQ0FJRSxlQUpGLEVBSW1CLENBSm5CLEVBS0orQixXQUxJLEVBQVA7Ozs7NkJBT09ZLE1BQU07YUFDTixJQUFJQyxHQUFKLENBQVFELElBQVIsQ0FBUDs7OzsyQkFFS1IsTUFBTVUsSUFBZ0I7VUFBWm5CLE1BQVksdUVBQUgsQ0FBRzs7V0FFeEJKLE9BREgsQ0FFR3ZDLElBRkgsQ0FFUSxDQUFDMkMsTUFBRCxFQUFTUyxJQUFULEVBQWVVLEVBQWYsQ0FGUjs7OztpQ0FJV25FLE1BQU07Y0FDVEEsSUFBUjthQUNPLEtBQUw7aUJBQ1MsQ0FBUDthQUNHLEtBQUw7aUJBQ1MsQ0FBUDthQUNHLE1BQUw7aUJBQ1MsQ0FBUDthQUNHLE9BQUw7aUJBQ1MsQ0FBUDthQUNHLEtBQUw7aUJBQ1MsQ0FBUDs7aUJBRU8sQ0FBUDs7Ozs7a0NBR1FvRSxRQUF3Qjs7O1VBQWhCcEIsTUFBZ0IsdUVBQVAsS0FBTzs7VUFDaENvQixPQUFPdkUsTUFBUCxLQUFrQixDQUF0QixFQUF5QjtZQUNuQmtFLENBQUosQ0FBTSw2QkFBTjs7OztVQUlFSSxLQUFLQyxPQUFPQyxHQUFQLEVBQVQ7VUFDSSxLQUFLUCxRQUFMLENBQWNLLEVBQWQsTUFBc0IsVUFBMUIsRUFBc0M7WUFDaENKLENBQUosQ0FBTSxtREFBbURJLEVBQXpEOzs7OztVQUtFRyxTQUFTLEVBQWI7YUFDT0MsT0FBUCxDQUFlLGVBQU87WUFDaEIsTUFBS1QsUUFBTCxDQUFjYixHQUFkLE1BQXVCLE9BQTNCLEVBQW9DO21CQUN6QkEsR0FBVDtTQURGLE1BRU8sSUFBSSxNQUFLYSxRQUFMLENBQWNiLEdBQWQsTUFBdUIsUUFBM0IsRUFBcUM7aUJBQ25DNUMsSUFBUCxDQUFZNEMsR0FBWjtTQURLLE1BRUE7Y0FDRGMsQ0FBSixDQUFNLHFGQUNKLFNBREY7OztPQU5KO2VBV1MsS0FBS1gsWUFBTCxDQUFrQkosTUFBbEIsQ0FBVDtXQUNLd0IsTUFBTCxDQUFZRixNQUFaLEVBQW9CSCxFQUFwQixFQUF3Qm5CLE1BQXhCOzs7OzZCQUVhO3dDQUFSb0IsTUFBUTtjQUFBOzs7V0FDUkssYUFBTCxDQUFtQkwsTUFBbkIsRUFBMkIsS0FBM0I7YUFDTyxJQUFQOzs7OzJCQUVjO3lDQUFSQSxNQUFRO2NBQUE7OztXQUNUSyxhQUFMLENBQW1CTCxNQUFuQixFQUEyQixNQUEzQjthQUNPLElBQVA7Ozs7NEJBRWU7eUNBQVJBLE1BQVE7Y0FBQTs7O1dBQ1ZLLGFBQUwsQ0FBbUJMLE1BQW5CLEVBQTJCLE9BQTNCO2FBQ08sSUFBUDs7OzswQkFFYTt5Q0FBUkEsTUFBUTtjQUFBOzs7V0FDUkssYUFBTCxDQUFtQkwsTUFBbkIsRUFBMkIsS0FBM0I7YUFDTyxJQUFQOzs7OzBCQUVhO3lDQUFSQSxNQUFRO2NBQUE7OztXQUNSSyxhQUFMLENBQW1CTCxNQUFuQixFQUEyQixLQUEzQjthQUNPLElBQVA7Ozs7eUJBRUdNLFdBQVdiLE9BQU87VUFDakJBLFVBQVVjLFNBQWQsRUFBeUI7Z0JBQ2ZELFNBQVI7b0JBQ1ksYUFBWjs7O1VBR0UsS0FBS1osUUFBTCxDQUFjRCxLQUFkLE1BQXlCLFlBQTdCLEVBQTJDOztZQUVyQ0UsQ0FBSixDQUFNLGdCQUFnQixLQUFLRCxRQUFMLENBQWNELEtBQWQsQ0FBaEIsR0FBdUMsb0JBQXZDLEdBQ0osSUFESSxHQUVKLHdCQUZGOzs7O1VBTUVmLFVBQVVlLE1BQU1mLE9BQXBCO1lBQ004QixXQUFOLENBQWtCQyxPQUFPdkQsS0FBUCxDQUFhd0IsT0FBYixFQUFzQmdDLElBQXRCLENBQTJCLGVBQU87WUFDOUN2RixHQUFKLEVBQ0UsT0FBT0EsR0FBUDs7WUFFRXdGLFdBQVdqQyxRQUFRa0MsS0FBUixFQUFmOztlQUVPQyxNQUFNbkMsT0FBTixFQUFlZ0MsSUFBZixDQUFvQixlQUFPOztjQUU1QixDQUFDdkYsR0FBRCxJQUFRQSxJQUFJMkYsTUFBSixLQUFlLEdBQXZCLElBQThCM0YsSUFBSTRGLElBQUosS0FBYSxPQUEvQyxFQUF3RDttQkFDL0M1RixHQUFQOzs7Y0FHRTZGLFdBQVc3RixJQUFJeUYsS0FBSixFQUFmOztpQkFHR0ssSUFESCxDQUNRWCxTQURSLEVBRUdJLElBRkgsQ0FFUSxpQkFBUztrQkFDUFEsR0FBTixDQUFVUCxRQUFWLEVBQW9CSyxRQUFwQjtXQUhKO2lCQUtPN0YsR0FBUDtTQWJLLENBQVA7T0FOZ0IsQ0FBbEI7Ozs7OztBQXlCSmdHLEtBQUs1QyxNQUFMLEdBQWMsSUFBSUEsTUFBSixFQUFkOzs7Ozs7Ozs7Ozs7OyJ9
