(function() {
  "use strict";

  var Hydra = {
    Models: {},
    Views: {}
  };

  Hydra.Models.Response = Backbone.Model.extend({
  });


  Hydra.Models.Documentation = Backbone.Model.extend({
    getTypeDefinition: function(url, vocab) {
      var type = this.getElementDefinition(url);

      if (!type) {
        return null;
      }

      if (('rdfs:Class' !== type['@type']) && ('hydra:Class' !== type['@type']) && type.domain) {
        type = this.getElementDefinition(type.domain);
      }

      vocab = vocab || this.get('vocab');

      if (!type.supportedProperties) {
        return type;
      }

      var self = this;
      type.properties = _.map(type.supportedProperties, function(entry) {
        var def = self.getElementDefinition(entry.property);

        def.required = ('required' in entry) ? entry.required : false;
        def.readonly = ('readonly' in entry) ? entry.readonly : false;
        def.writeonly = ('writeonly' in entry) ? entry.writeonly : false;

        if (entry.hydra_title) {
          def.label = entry.hydra_title;
        }
        if (entry.hydra_description) {
          def.description = entry.hydra_description;
        }

        return def;
      });

      for (var i = type.properties.length - 1; i >= 0; i--) {
        var rangeDef = this.getElementDefinition(type.properties[i].range);
        if (rangeDef) {
          type.properties[i]['rangeLabel'] = (rangeDef.hydra_title)
            ? rangeDef.hydra_title
            : rangeDef.label;
        }
      }

      return type;
    },

    getElementDefinition: function(url, vocab) {
      vocab = vocab || this.get('vocab');

      if (!url)
        return;  // TODO Ensure this never happens

      var element = _.find(vocab, function(entry) {
        return entry['@id'] === url;
      });

      if (element) {
        if (element.hydra_title) {
          element.label = element.hydra_title;
        }
        if (element.hydra_description) {
          element.description = element.hydra_description;
        }
      }


      if (!element || !element.label) {
        if (0 === url.indexOf('http://www.w3.org/2001/XMLSchema#')) {
          return {
            '@id': url,
            'label': url.substr(url.indexOf('#') + 1).toLowerCase()
          }
        } else if (0 === url.indexOf('http://www.w3.org/ns/hydra/core#')) {
          return {
            '@id': url,
            'label': url.substr(url.indexOf('#') + 1)
          }
        } else if ('http://www.w3.org/2002/07/owl#Nothing' === url) {
          return {
            '@id': url,
            'label': '--'
          }
        }
      }

      if (element && element.range) {
        var rangeDef = this.getElementDefinition(element.range, vocab);

        if (rangeDef.supportedOperations && (rangeDef.supportedOperations.length > 0)) {
          if (!element.supportedOperations) {
            element.supportedOperations = rangeDef.supportedOperations;
          } else {
            element.supportedOperations = _.uniq(
              element.supportedOperations.concat(rangeDef.supportedOperations),
              false,
              function(val) {
                return val['@id'];
              }
            );
          }
        }
      }

      return element;
    },

    getTypes: function(vocab) {
      vocab = vocab || this.get('vocab');

      var isClass = function (t) { return (('rdfs:Class' === t) || ('hydra:Class' === t)); };
      var types = _.map(vocab, function (entry) {
          var types = entry['@type'];
          if (_.isArray(types)) {
              return _.find(types, isClass) ? entry : null;
          } else {
              return isClass(types) ? entry : null;
          }
      });
      types = _.filter(types, function (t) { return t !== null; });


      _.each(types, function(type) {
        if (type.hydra_title) {
          type.label = type.hydra_title;
        }
        if (type.hydra_description) {
          type.description = type.hydra_description;
        }
      });

      return types;
    }
  });


  Hydra.Models.OperationsModal = Backbone.Model.extend({
    update: function(operations, target) {
      var i;

      for (i = operations.length - 1; i >= 0; i--) {
        var def;
        if (operations[i].expects) {
          def = window.HydraClient.getElementDefinition(operations[i].expects);
          if (def) {
            operations[i]['expectsLabel'] = def.label;
          }
        }

        if (operations[i].returns) {
          def = window.HydraClient.getElementDefinition(operations[i].returns);
          if (def) {
            operations[i]['returnsLabel'] = def.label;
          }
        }
      }

      if (target) {
        operations = _.union(operations, [
          { "method": "GET", "isDefault": true },
          { "method": "POST", "isDefault": true },
          { "method": "PUT", "isDefault": true },
          { "method": "DELETE", "isDefault": true },
          { "method": "PATCH", "isDefault": true }
        ]);
      }

      var methodSortOrder = {
        'GET':     2,
        'POST':    4,
        'PUT':     6,
        'DELETE':  8,
        'PATCH':  10
      };

      operations = _.sortBy(operations, function(operation) {
        return methodSortOrder[operation.method] + ((operation.isDefault) ? -1 : 0);
      });

      var length = operations.length;
      var method = operations[length - 1].method;
      for (i = length - 2; i >= 0; i--) {
        if ((true === operations[i].isDefault) && (method === operations[i].method)) {
          operations.splice(i, 1);
        } else {
          method = operations[i].method;
        }
      }

      this.set({ 'operations': operations, 'target': target, 'selected': null });
    }
  });

  Hydra.Views.AddressBar = Backbone.View.extend({
    // initialize: function(opts) {
    //   var self = this;
    //   this.vent = opts.vent;
    //   this.vent.bind('location-change', function(e) {
    //     self.setLocation(e.url);
    //   });
    // },

    setUrl: function(url) {
      this.url.val(url);
    },

    getUrl: function() {
      return this.url.val();
    },

    url: $('#url')
  });

  Hydra.Views.Response = Backbone.View.extend({
    el: $("#response"),

    events: {
      'click a': 'clickLink'
    },

    initialize: function() {
      this.model.bind('change', this.render, this);
    },

    clickLink: function(e) {
      e.preventDefault();
      var $target = $(e.target);
      var uri = $target.attr('href') || $target.parent().attr('href');

      if (e.shiftKey || ('GET' === $target.attr('data-action'))) {
        window.HydraClient.get(uri);
        return;
      }

      var element = $target;
      var property = null;
      var types = null;

      // TODO Add support for multiple types
      if (('@id' === element.parent().parent().attr('data-iri')) && (element.parent().parent().siblings('.prop[data-iri="@type"]').length > 0)) {
        types = JSON.parse(element.parent().parent().siblings('.prop[data-iri="@type"]').children('span')[1].title)['@id'];
      }

      do {
        if (element.hasClass('prop') && element.attr('data-iri') && ('@id' !== element.attr('data-iri'))) {
          property = element.attr('data-iri');
          break;
        }

        element = element.parent();
      } while ('response' !== element.attr('id'));

      // If the property is the value of a keyword GET it (or show the @type documentation), otherwise show dialog
      if ((null !== property) && ('@' === property[0])) {
        if ('@type' === property) {
          window.HydraClient.showDocumentation(uri);
        } else {
          window.HydraClient.get(uri);
        }
      } else {
        window.HydraClient.showOperationsModal(_.union(property, types), uri);
      }
    },

    render: function() {
      if (null !== this.model.get('data')) {
        this.$el.html( this.renderResponse(this.model.get('data'), '', true));
        $('.prop-key').tooltip({ 'placement': 'right' });
        $('.literal').tooltip({ 'placement': 'right' });
        $('.context').popover( {
          'trigger': 'hover',
          'placement': 'right',
          'title': 'Active context',
          'html': true
        });
      } else {
        if (this.model.get('headers')) {
          this.$el.html(
            '<span class="muted">' +
            _.escape(this.model.get('headers')) +
            '</span><br>');
        } else {
          this.$el.html('<span class="muted">empty</span>');
        }
      }
      return this;
    },

    renderResponse: function(data, indent, last) {
      var result = '';
      var i;

      if (_.isArray(data)) {
        result += '[<br>' + indent;
        for (i = 0; i < data.length; i++) {
          result += '  ';
          result += this.renderResponse(data[i], indent + '  ', (i === data.length - 1));
          result += indent;
        }
        result += ']';
      } else if (_.isObject(data)) {
        if ('__orig_value' in data) {
          result += '<span';
          result += ' title="' + _.escape(JSON.stringify(data.__value)) + '"';

          if ('@id' in data.__value) {
            result += '><a href="' + data.__value['@id'] + '">';
          } else {
             result += ' class="literal">';
          }
          result += _.escape(JSON.stringify(data.__orig_value));
          if ('@id' in data.__value) {
            result += '</a>';
          }

          result += '</span>';
          result += (last) ? '' : ',';
          result += '<br>';

          return result;
        }

        // not a literal, start a new object
        result += '{<br>';

        var keys = _.keys(data);
        for (i = 0; i < keys.length; i++) {
          var key = keys[i];
          var value = data[key];

          result += indent + '  ';
          if ('@context' === key) {
            //result += '&quot;@context&quot;: ' + _.escape(JSON.stringify(value)) + '<br>';
            result += '&quot;@context&quot;: <span class="context" data-content="<pre>';
            result += _.escape(JSON.stringify(value.__activectx, null, 2)).replace(/\n/g, '<br>');
            result += '</pre>">';
            result += _.escape(JSON.stringify(value.__value, null, 2)).replace(/\n/g, '<br>  ' + indent);
            result += '</span>';
            result += (i === keys.length - 1) ? '' : ',';
            result += '<br>';
          } else if ('@value' === key) {
              result += '<span class="prop">&quot;<span class="prop-key" title="@value">@value</span>&quot;: ';
              result += this.renderResponse(value, indent + '  ',  (i === keys.length - 1));
              result += '</span>';
              continue;
          } else {
            if (value.__iri) {
              var reverse = '';
              if ('^' === value.__iri[0]) {
                value.__iri = value.__iri.substr(1);
                reverse = 'reverse of ';
              }
              result += '<span class="prop" data-iri="' + _.escape(value.__iri);
              result += '">&quot;<span class="prop-key" title="' + _.escape(reverse + value.__iri) + '">' + _.escape(key);
              result += '</span>&quot;: ';
            } else {
              result += '<span class="not-mapped-prop">&quot;<span class="prop-key" title="not mapped to an IRI">';
              result += _.escape(key);
              result += '</span>&quot;: ';
            }

            result += this.renderResponse(value.__value, indent + '  ',  (i === keys.length - 1));
            result += '</span>';
          }
        }
        result += indent + '}';
      } else {
        result += _.escape(JSON.stringify(data));
      }

      result += (last) ? '' : ',';
      result += '<br>';

      return result;
    }

  });

  Hydra.Views.Documentation = Backbone.View.extend({
    el: $("#documentation"),
    title: $("#documentation-title"),
    typesMenu: $("#documentation ul.dropdown-menu"),
    details: $("#documentation-details"),
    template: _.template($('#documentation-template').html()),

    initialize: function() {
      this.model.bind('change:type', this.render, this);
      this.model.bind('change:vocab', this.updateAvailableTypes, this);
      this.model.bind('change:vocab', this.render, this);

      this.details.on("click", ".operations", function () {
        window.HydraClient.showOperationsModal([ $(this).attr('data-iri') ], null);
      });

      this.typesMenu.on("click", "a", function(e) {
        e.preventDefault();
        window.HydraClient.showDocumentation(e.target.href);
      });
    },

    /*events: {
      "click .icon":          "open",
      "click .button.edit":   "openEditDialog",
      "click .button.delete": "destroy"
    },*/

    render: function() {
      var type = this.model.get('type');
      var vocab = this.model.get('vocab');
      var definition;

      if (null === vocab) {
        this.title.html('');
        this.details.html('<p>Loading ...</p>');
      } else if ((false === vocab) || (null === (definition = this.model.getTypeDefinition(type)))) {
        this.title.html('');
        this.details.html('<p>Loading the documentation failed.</p>');
      } else {
        this.title.attr('href', definition['@id']);
        this.title.html('<h4>' + _.escape(definition.label) + ' <b class="caret"></b></h4>');
        this.details.html(this.template({ 'docu': definition }));
      }
      return this;
    },

    updateAvailableTypes: function() {
      var types = this.model.getTypes();
      var menu = '';

      types = _.sortBy(types, 'label');

      _.each(types, function(type) {
        menu += '<li><a href="' + type['@id'] + '">' + _.escape(type.label) + '</a></li>';
      });

      this.typesMenu.html(menu);
    }

  });


  Hydra.Views.OperationsModal = Backbone.View.extend({
    el: $("#operationsModal"),
    dialog: $("#operationsModal"),
    template: _.template($('#operationsModal-template').html()),

    initialize: function() {
      this.model.bind('change', this.render, this);
      this.model.bind('change:selected', this.operationSelected, this);

      $('#operationsModal-template').remove();
    },

    /*events: {
      "click .icon":          "open",
      "click .button.edit":   "openEditDialog",
      "click .button.delete": "destroy"
    },*/

    operationSelected: function() {
      var self = this;
      var selected = self.model.get('selected');

      self.model.set({ 'expectsDef' : null }, { silent: true });

      if (null !== selected) {
        var expects = self.model.get('operations')[selected].expects;

        if (expects) {
          // TODO Handle case when type is not in vocab
          self.model.set(
            { 'expectsDef' : self.options.documentation.getTypeDefinition(expects) },
            { silent: true }
          );
        }
      }
    },

    render: function() {
      var self = this;

      self.dialog.html(self.template(self.model.toJSON()));

      self.dialog.on("click", ".operation", function () {
        self.model.set({ 'selected': $(this).attr('data-index') });
      });

      $('#operationsForm').on('submit', function() { return self.onInvoke(); });

      return this;
    },

    onInvoke: function() {
      var self = this;
      var operation = self.model.get('operations')[self.model.get('selected')];

      if (!operation) {
        alert("You must select an operation.");
        return false;
      }

      if ('GET' === operation.method) {
        window.HydraClient.get(self.model.get('target'));
      } else {
        window.HydraClient.request(
          operation.method,
          self.model.get('target'),
          self.getRequestBody(self.model.get('expectsDef')));
      }

      self.dialog.modal('hide');

      return false;
    },

    getRequestBody: function(expects) {
      if (!expects && (0 === $('#operationsForm textarea').length)) {
        return null;
      }

      var formData = $('#operationsForm').serializeArray();
      var result = {};

      if (!expects) {
        return formData[0].value;
      }

      result['@context'] = {};

      _.each(expects['properties'], function(property) {
        result['@context'][property['label']] = property['@id'];
      });

      result['@type'] = expects['@id'];

      _.each(formData, function(element) {
        result[element.name] = ('' === element.value) ? null : element.value;
      });

      return JSON.stringify(result);
    }

  });


  Hydra.Client = {
    addressbar: new Hydra.Views.AddressBar(),
    documentation: {},
    response: {},
    operationsModal: { widget: $('#operationsModal') },

    initialize: function() {
      $.ajaxSetup({
        headers: {
          'Accept': 'application/ld+json, application/json;q=0.1'
        },
        'contentType': 'application/ld+json',
        'dataType': 'json'
        // cache: false
      });

      this.documentation.model = new Hydra.Models.Documentation();
      this.documentation.view = new Hydra.Views.Documentation({
        model: this.documentation.model
      });

      this.response.model = new Hydra.Models.Response();
      this.response.view = new Hydra.Views.Response({
        model: this.response.model
      });

      this.operationsModal.model = new Hydra.Models.OperationsModal();
      this.operationsModal.view = new Hydra.Views.OperationsModal({
        model: this.operationsModal.model,
        documentation: this.documentation.model
      });

      return this;
    },

    get: function(url) {
      this.request('GET', url);
    },

    request: function(method, url, data) {
      var self = this;

      data = data || null;

      $('#load').removeClass('btn-inverse');

      self.invokeRequest(method, url, data).done(function(resource, textStatus, jqXHR) {
        //self.vent.trigger('response', { resource: resource });
        var linkHeaders = self.parseLinkHeader(jqXHR.getResponseHeader('Link'));

        if (linkHeaders['http://www.w3.org/ns/hydra/core#apiDocumentation']) {
          var apiDocUrl = linkHeaders['http://www.w3.org/ns/hydra/core#apiDocumentation'];

          if (apiDocUrl !== self.documentation.model.get('vocabUrl')) {
            self.documentation.model.set({ 'vocab': null, 'vocabUrl': null });

            var jqxhr = $.getJSON('proxy.php', { 'url': apiDocUrl, 'vocab': 1 }, function(resource) {
              //self.vent.trigger('response', { resource: resource });
              var apiDoc = resource['@graph'];
              self.documentation.model.set({'vocab': apiDoc, 'vocabUrl': apiDocUrl });
            }).error(function() {
              self.documentation.model.set({ 'vocab': false, 'vocabUrl': null });
            });
          }
        }

        if (resource.trim().length > 0) {
          resource = JSON.parse(resource);

          self.response.model.set({
            data: resource,
            headers: self.getHeaders(jqXHR)
          });

          if (_.isObject(resource) && ('@type' in resource)) {
            self.showDocumentation(resource['@type'].__value.__value['@id']);
          }
        } else {
          self.response.model.set({
            data: null,
            headers: self.getHeaders(jqXHR)
          });
        }

        if (jqXHR.getResponseHeader('Content-Location')) {
          self.addressbar.setUrl(jqXHR.getResponseHeader('Content-Location'));
        } else {
          self.addressbar.setUrl(url);
        }
      }).fail(function(jqXHR) {
        self.response.model.set({
          data: null,
          headers: self.getHeaders(jqXHR)
        });
        self.addressbar.setUrl(url);
      }).always(function() {
        $('#load').addClass('btn-inverse');
      });
    },

    getHeaders: function(jqXHR) {
      return 'HTTP/1.1 ' + jqXHR.status + ' ' + jqXHR.statusText + "\n" + jqXHR.getAllResponseHeaders();
    },

    invokeRequest: function(method, url, data, headers) {
      var self = this;

      var settings = {
        'type': method || 'GET',
        'headers': headers || { 'Accept': 'application/ld+json, application/json;q=0.1' },
        'processData': false,
        'data': data || null,
        'dataType': 'text'
      };

      return $.ajax('proxy.php?debug=true&url=' + encodeURI(url), settings);
    },

    parseLinkHeader: function(header) {
      var links = {};

      if (!header || (0 === header.trim().length)) {
        return links;
      }

      var parts = header.split(',');

      for(var i = parts.length - 1; i >= 0; i--) {
        var params = parts[i].split(';');
        var url, rel;
        for (var j = params.length - 1; j >= 0; j--) {
          if ('<' === params[j].trim()[0]) {
            url = params[j].trim().slice(1, -1);
          } else {
            var p = params[j].split('=');
            if ((2 === p.length) && ('rel' === p[0].trim())) {
              rel = p[1].trim().slice(1, -1);
            }
          }
        }
        if (url && rel) {
          links[rel] = url;
        }
      }

      return links;
    },

    showDocumentation: function(url) {
      var self = this;

      if ((undefined === url) || (null === url)) {
        return;
      }

      self.documentation.model.set({ 'type' : url });
    },

    getElementDefinition: function(url, vocab) {
      return this.documentation.model.getElementDefinition(url, vocab);
    },

    showOperationsModal: function(elements, target) {
      var self = this;

      // Operations can
      //    - be associated with the type
      //    - or the property
      //    - or be expressed in-line
      //
      elements = _.filter(elements, function(element) {
        return ((undefined !== element) && (null !== element));
      });

      if (0 === elements.length) {
        return;
      }

      var operations = [];
      var showModal = _.after(elements.length, function() {
        self.operationsModal.model.update(operations, target);
        self.operationsModal.widget.modal('show');
      });

      _.each(elements, function(elementIri) {
        var element = self.documentation.model.getElementDefinition(elementIri);

        if (element) {
          if ('supportedOperations' in element) {
            operations = _.union(operations, element.supportedOperations);
          }

          showModal();
        }
      });
    }
  };

  window.HydraClient = Hydra.Client.initialize();
})();



// ---- Activate tooltips and popovers

$('#addressbar').on("submit", function () {
    window.HydraClient.get($('#url').val());
    return false;
});

$('#response').on("mouseenter", ".prop", function (event) {
    var property = $(this).attr('data-iri');
    if (property && document.getElementById(property)) {
      $(document.getElementById(property)).addClass("prop-highlight");
    }

    event.stopPropagation();
});

$('#response').on("mouseleave", ".prop", function (event) {
    var property = $(this).attr('data-iri');
    if (property && document.getElementById(property)) {
      $(document.getElementById(property)).removeClass("prop-highlight");
    }

    event.stopPropagation();
});


$(document).ready(function() {
  // window.HydraClient.showDocumentation();
  // //window.HydraClient.get('http://hydra.test/app_dev.php/');
  // window.HydraClient.get('http://www.markus-lanthaler.com/hydra/api-demo/');

  var queryParams = {};
  if (window.location.search.length > 1) {
    for (var aItKey, nKeyId = 0, aCouples = window.location.search.substr(1).split("&"); nKeyId < aCouples.length; nKeyId++) {
      aItKey = aCouples[nKeyId].split("=");
      queryParams[unescape(aItKey[0])] = aItKey.length > 1 ? unescape(aItKey[1]) : "";
    }
  }

  if ('url' in queryParams) {
    $('#url').val(queryParams.url);
  }

  $('#url').select();
});
