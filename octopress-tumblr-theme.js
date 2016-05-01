/**
 * Copyright (c) 2013-2015 Yamagishi Kazutoshi
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(function(global) {
  'use strict';

  var undefined;
  var window = global.window || {};
  var HEADLINE_SELECTOR = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6'
  ].map(function(selector) {
    return selector + ':first-child';
  }).join(', ');

  function removeChildNodes(node) {
    var document = node.ownerDocument;
    var headline = node.querySelector(HEADLINE_SELECTOR);
    var lastChild = node.querySelector(':last-child');
    var range = document.createRange();
    range.setStartAfter(headline);
    range.setEndBefore(lastChild);
    range.deleteContents();
    return lastChild;
  };

  function QueryString() {
  }

  QueryString.stringify = function stringify(value) {
    if (typeof value !== 'object') {
      return '' + value;
    }
    var pairs = [];
    var pair, key, item;
    for (key in value) {
      if (!value.hasOwnProperty(key) || !(item = value[key])) {
        continue;
      }
      pair = [encodeURIComponent(key)];
      if (typeof item !== 'boolean') {
        pair.push(encodeURIComponent(item));
      }
      pairs.push(pair.join('='));
    }
    return pairs.join('&');
  };

  function JSONHttpRequest() {
    this.method = undefined;
    this.uri = undefined;
    this.response = null;
    this.responseText = null;
    this.listeners = [];
  };

  (function(proto) {
    function executeListeners(event, listeners) {
      var len, i, listener;
      if (typeof listeners !== 'undefined') {
        len = listeners.length;
        for (i = 0; i < len; ++i) {
          listener = listeners[i];
          listen.call(this, event, listener);
        }
      }
    }

    function insertScript(uri) {
      var document = window.document;
      var body = document.getElementsByTagName('body')[0];
      var script = document.createElement('script');
      script.setAttribute('src', uri);
      body.appendChild(script);
      return script;
    }

    function listen(event, listener) {
      if (listener && typeof listener.handleEvent === 'function') {
        listener = listener.handleEvent.bind(listener);
      }
      if (typeof listener === 'function') {
        listener.call(this, event);
      }
    }

    proto.addEventListener = function addEventListener(type, handler) {
      if (typeof this.listeners[type] === 'undefined') {
        this.listeners[type] = [];
      }
      this.listeners[type].push(handler);
    };

    proto.open = function open(method, uri) {
      this.method = method;
      this.uri = uri;
    };

    proto.send = function send() {
      var listeners = this.listeners;
      var callbackName = '____________callback' + (new Date()).getTime();
      var uri = this.uri;
      uri += [
        uri.indexOf('?') >= 0 ? '&' : '?',
        'callback=',
        encodeURIComponent(callbackName)
      ].join('');
      var reset = function reset() {};
      var request = this;
      global[callbackName] = function successHandler(parsedJson) {
        var successListeners = listeners['load'];
        request.response = parsedJson;
        request.responseText = JSON.stringify(parsedJson);
        executeListeners.call(request, {
          target: request,
          type: 'load'
        }, successListeners);
        reset();
      };
      var errorHandler = function errorHandler(event) {
        var target = event.target;
        var errorListeners = listeners['error'];
        target.removeEventListener('error', errorHandler);
        executeListeners.call(request, {
          target: request,
          type: 'error'
        }, errorListeners);
        reset();
      };
      var script = insertScript(uri);
      reset = function reset() {
        try {
          delete global[callbackName];
        } catch (error) {
          global[callbackName] = undefined;
        }
        script.parentNode.removeChild(script);
      };
      script.addEventListener('error', errorHandler);
    };
  })(JSONHttpRequest.prototype);

  function RecentlyPosts(successHandler, errorHandler) {
    this.successHandler = successHandler;
    this.errorHandler = errorHandler;
  }

  RecentlyPosts.FEED_CONTENT_TYPES = [
    'application/xml',
    'application/atom+xml',
    'application/rdf+xml',
    'application/rss+xml'
  ];
  RecentlyPosts.ATOM_NAMESPACE_URI = 'http://www.w3.org/2005/Atom';
  RecentlyPosts.RDF_NAMESPACE_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

  (function(proto) {
    proto.get = function get(feedUri) {
      var client = new XMLHttpRequest();
      client.open('GET', feedUri);
      client.addEventListener('load', this, false);
      client.addEventListener('error', this, false);
      client.send(null);
    };

    proto.handleEvent = function handleEvent(event) {
      var client = event.target;
      var response = client.responseXML;
      var type = event.type;
      var parsedResponse;
      var error;
      if (type === 'error' || [200, 304].indexOf(client.status) < 0) {
        if (typeof this.errorHandler === 'function') {
          error = new TypeError('Don\'t get response.');
          this.errorHandler.call(this, error);
        }
        return;
      }
      try {
        parsedResponse = this.parseResponse(response);
      } catch (e) {
        this.errorHandler.call(this, e);
        return;
      }
      this.successHandler.call(this, parsedResponse);
    };

    proto.parseResponse = function parseResponse(xml) {
      var rootElement = xml.documentElement;
      var localName = rootElement.localName;
      var namespaceUri = rootElement.namespaceURI;
      if (localName === 'rss' && namespaceUri === null) {
        return this.parseRss2.apply(this, arguments);
      } else if (localName === 'RDF' && namespaceUri === RecentlyPosts.RDF_NAMESPACE_URI) {
        return 'parseRss'; // todo
      } else if (localName === 'feed' && namespaceUri === RecentlyPosts.ATOM_NAMESPACE_URI) {
        return 'parseAtom'; // todo
      }
      return {};
    };

    proto.parseRss2 = function parseRss2(xml) {
      var items = xml.querySelectorAll('item');
      return Array.prototype.map.call(items, this.parseRss2Item);
    };

    proto.parseRss2Item = function parseRss2Item(item) {
      var uri = item.getElementsByTagName('link')[0].textContent;
      var title = item.getElementsByTagName('title')[0].textContent;
      var summary = item.getElementsByTagName('description')[0].textContent;
      var date = (function() {
        var pubDate = item.getElementsByTagName('pubDate')[0].textContent;
        return new Date(pubDate);
      })();
      return {
        uri: uri,
        title: title,
        summary: summary,
        date: date
      };
    };
  })(RecentlyPosts.prototype);

  function PopularPosts(successHandler, errorHandler) {
    this.successHandler = successHandler;
    this.errorHandler = errorHandler;
  }

  (function(proto) {
    proto.get = function get(blogUri) {
      var apiUri = this.getApiUri(blogUri);
      var client = new JSONHttpRequest();
      client.open('get', apiUri);
      client.addEventListener('load', this);
      client.addEventListener('error', this);
      client.send(null);
    };

    proto.getApiUri = function getApiUri(uri) {
      var baseUri = 'http://b.hatena.ne.jp/entrylist/json';
      var queryString = QueryString.stringify({
        sort: 'count',
        url: uri
      });
      return [
        baseUri,
        queryString
      ].join('?');
    };

    proto.handleEvent = function handleEvent(event) {
      if (event.type !== 'load') {
        return;
      }
      var client = event.target;
      var response = client.response;
      var parsedResponse = this.parseResponse(response);
      this.successHandler.call(this, parsedResponse);
      return;
    };

    proto.parseResponse = function parseResponse(array) {
      return (array || []).map(function(object) {
        var title = object.title;
        title += ' (' + object.count + ')';
        return {
          title: title,
          uri: object.link
        };
      });
    };
  })(PopularPosts.prototype);

  function SiteScript(window) {
    window.addEventListener('DOMContentLoaded', this, false);
  }

  (function(proto) {
    proto.getEventHandler = function getEventHandler(event) {
      var methodNames = this.getMethodNames.apply(this, arguments);
      var methods = methodNames.map(function(methodName) {
        var method = this[methodName];
        return method;
      }, this).filter(function(method) {
        return typeof method === 'function';
      });
      var args = Array.prototype.slice.call(arguments);
      return function handler() {
        methods.some(function(method) {
          return event.defaultPrevented || method.apply(this, args);
        }, this);
      }.bind(this);
    };

    proto.getMethodNames = function getMethodNames(event) {
      var type = event.type;
      var methodNames = getMethodNames.list[type] || [];
      return methodNames;
    };

    proto.getMethodNames.list = {
      DOMContentLoaded: [
        'setPlaceholder',
        'showingPopularPosts',
        'showingRecentlyPosts'
      ]
    };

    proto.handleEvent = function handleEvent(event) {
      var handler = this.getEventHandler(event);
      return handler.apply(this, arguments);
    };

    proto.insertPosts = function insertPosts(container, entries) {
      var document = container.ownerDocument;
      var listElement = document.createElement('ol');
      var baseListItemElement = (function() {
        var listItemElement = document.createElement('li');
        var anchorElement = document.createElement('a');
        listItemElement.appendChild(anchorElement);
        return listItemElement;
      })();
      (entries || []).forEach(function(entry) {
        var listItemElement = baseListItemElement.cloneNode(true);
        var anchorElement = listItemElement.getElementsByTagName('a')[0];
        anchorElement.setAttribute('href', entry.uri);
        anchorElement.textContent = entry.title;
        listElement.appendChild(listItemElement);
      });
      if ((listElement.childNodes || []).length <= 0) {
        return;
      }
      var lastChild = removeChildNodes(container);
      container.insertBefore(listElement, lastChild);
    };

    proto.setPlaceholder = function setPlaceholder(event) {
      var document = event.target;
      var textFields = document.getElementsByClassName('search');
      Array.prototype.forEach.call(textFields, function(textField) {
        textField.placeholder = 'Search';
      });
    };

    proto.showingPopularPosts = function showingPopularPosts(event) {
      var document = event.target;
      var blogUri = (function(location) {
        var uri = location.href;
        var blogUri = (uri.match(/^(https?:\/\/[^\/]+\/).*$/) || [])[1];
        return blogUri;
      })(document.defaultView && document.defaultView.location);
      var popularPostsContainer = document.getElementById('popular-posts');
      var successHandler = this.insertPosts.bind(this, popularPostsContainer);;
      var popularPosts = new PopularPosts(successHandler);
      popularPosts.get(blogUri);
    };

    proto.showingRecentlyPosts = function showingRecentlyPosts(event) {
      var document = event.target;
      var feedUri = (function() {
        var alternateLinks = document.querySelectorAll('link[rel="alternate"]');
        var feedUri;
        Array.prototype.some.call(alternateLinks, function(alternateLink) {
          var contentType = alternateLink.getAttribute('type');
          if (RecentlyPosts.FEED_CONTENT_TYPES.indexOf(contentType) < 0) {
            return false;
          }
          feedUri = alternateLink.getAttribute('href');
          return true;
        });
        return feedUri;
      })();
      var recentPostsContainer = document.getElementById('recent-posts');
      var successHandler = this.insertPosts.bind(this, recentPostsContainer);
      var recentlyPosts = new RecentlyPosts(successHandler);
      recentlyPosts.get(feedUri);
    };
  })(SiteScript.prototype);

  function main(window) {
    new SiteScript(window);
  }

  if (window === global) {
    main(window);
  }
})(this);
