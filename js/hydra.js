(function() {
  var Hydra = {
    Models: {},
    Views: {}
  };

  Hydra.Models.Response = Backbone.Model.extend({
  });


  Hydra.Models.Documentation = Backbone.Model.extend({
    getTypeDefinition: function(url, vocab) {
      var type = this.getElementDefinition(url);

      if ('rdfs:Class' !== type['@type']) {
        type = this.getElementDefinition(type.domain);
      }

      var vocab = vocab || this.get('vocab');
      type.properties = _.filter(vocab, function(entry) {
        return entry['domain'] === type['@id'];
      });

      return type;
    },

    getElementDefinition: function(url, vocab) {
      var vocab = vocab || this.get('vocab');

      var element = _.find(vocab, function(entry) {
        return entry['@id'] === url;
      });

      return element;
    },
  });


  Hydra.Models.OperationsModal = Backbone.Model.extend({
    update: function(operations, target) {
      if (target) {
        operations = _.union(operations, [
          { "method": "GET", "default": true },
          { "method": "POST", "default": true },
          { "method": "PUT", "default": true },
          { "method": "DELETE", "default": true },
          { "method": "PATCH", "default": true }
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
        return methodSortOrder[operation.method] + ((operation.default) ? -1 : 0);
      });

      var length = operations.length;
      var method = operations[length - 1].method;
      for (var i = length -2; i >= 0; i--) {
        if ((true === operations[i].default) && (method === operations[i].method)) {
          operations.splice(i, 1);
        } else {
          method = operations[i].method;
        }
      }

      this.set({ 'operations': operations, 'target': target, 'selected': null ,});
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

      if (e.shiftKey) {
        window.HydraClient.get(uri);
        return;
      }

      var element = $target;
      var property = null;
      do {
        if (element.hasClass('prop') && element.attr('data-iri') && '@id' !== element.attr('data-iri')) {
          property = element.attr('data-iri');
          break;
        }

        element = element.parent();
      } while ('response' !== element.attr('id'));

      if (null == property) {
        alert('Failed to find property associated with this IRI');
        return;
      }

      // If the property is the value of a keyword GET it (or show the @type documentation), otherwise show dialog
      if ('@' === property[0]) {
        if ('@type' === property) {
          window.HydraClient.showDocumentation(uri);
        } else {
          window.HydraClient.get(uri);
        }
      } else {
        window.HydraClient.showOperationsModal(property, uri);
      }
    },

    render: function() {
      if (null !== this.model.get('data')) {
        this.$el.html( this.renderResponse(this.model.get('data'), '', false));
        $('.prop-key').tooltip({ 'placement': 'right' });
        $('.literal').tooltip({ 'placement': 'right' });
        $('.context').popover( {
          'trigger': 'hover',
          'placement': 'right',
          'title': 'Active context'
        });
      } else {
        if (this.model.get('headers')) {
          this.$el.html(
            '<span class="muted">' +
            _.escape(this.model.get('headers')).replace("\n", '<br>') +
            '</span><br>'
          );
        } else {
          this.$el.html('<span class="muted">empty</span>');
        }
      }
      return this;
    },

    renderResponse: function(data, indent, last) {
      var result = '';

      if (_.isArray(data)) {
        result += '[<br>' + indent;
        for (var i = 0; i < data.length; i++) {
          result += '  ';
          result += this.renderResponse(data[i], indent + '  ', (i === data.length - 1));
          result += indent;
        }
        result += ']';
        result += (last) ? '' : ',';
      } else if (_.isObject(data)) {
        if ('__orig_value' in data) {
          result += '<span';
          result += ' title="' + _.escape(JSON.stringify(data.__value)) + '"';

          if ('@id' in data.__value) {
            result += '><a href="' + data.__value['@id'] + '">';
          } else {
             result += ' class="literal">'
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
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var value = data[key];

          result += indent + '  ';
          if ('@context' === key) {
            //result += '&quot;@context&quot;: ' + _.escape(JSON.stringify(value)) + '<br>';
            result += '&quot;@context&quot;: <span class="context" data-content="<pre>';
            result += _.escape(JSON.stringify(value.__activectx, null, 2)).replace("\n", '<br>');
            result += '</pre>">';
            result += _.escape(JSON.stringify(value.__value, null, 2)).replace(/\n/g, '<br>  ' + indent);
            result += '</span>';
            result += (last) ? '' : ',';
            result += '<br>';
          } else {
            if ('__iri' in value) {
              result += '<span class="prop" data-iri="' + _.escape(value.__iri);
              result += '">&quot;<span class="prop-key" title="' + _.escape(value.__iri) + '">' + _.escape(key);
              result += '</span>&quot;: ';
            }

            result += this.renderResponse(value.__value, indent + '  ',  (i === keys.length - 1));
            result += '</span>';
          }
        }
        result += indent + '}';
      } else {
        result += _.escape(JSON.stringify(data));
        result += (last) ? '' : ',';
      }

      result += '<br>';

      return result;
    }

  });

  Hydra.Views.Documentation = Backbone.View.extend({
    el: $("#documentation"),
    title: $("#documentation-title"),
    details: $("#documentation-details"),
    template: _.template($('#documentation-template').html()),

    initialize: function() {
      this.model.bind('change:type', this.render, this);

      this.details.on("click", ".operations", function () {
        window.HydraClient.showOperationsModal($(this).attr('data-iri'), null);
      });
    },

    /*events: {
      "click .icon":          "open",
      "click .button.edit":   "openEditDialog",
      "click .button.delete": "destroy"
    },*/

    render: function() {
      var type = this.model.get('type');
      if (null === type) {
        this.title.html('');
        this.details.html('<p>Loading ...</p>');
      } else if (false === type) {
        this.title.html('');
        this.details.html('<p>Loading the documentation failed.</p>');
      } else {
        var definition = this.model.getTypeDefinition(this.model.get('type'));

        this.title.html(_.escape(definition.short_name));
        this.details.html(this.template({ 'docu': definition }));
      }
      return this;
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

      $('#operationsForm').on('submit', function() { return self.onInvoke() });

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
          self.getRequestBody(self.model.get('expectsDef'))
        );
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
        result['@context'][property['short_name']] = property['@id'];
      });

      result['@type'] = expects['@id'];

      _.each(formData, function(element) {
        result[element.name] = ('' == element.value) ? null : element.value;
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
        'dataType': 'json',
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

      data = data || null

      $('#load').removeClass('btn-inverse');

      var jqxhr = self.invokeRequest(method, url, data)
        .done(function(resource, textStatus, jqXHR) {
          //self.vent.trigger('response', { resource: resource });

          if (resource.trim().length > 0) {
            self.response.model.set({
              data: JSON.parse(resource),
              headers: 'HTTP/1.1 ' + jqXHR.status + ' ' + jqXHR.statusText + "\n" + jqXHR.getAllResponseHeaders()
            });
          } else {
            self.response.model.set({
              data: null,
              headers: 'HTTP/1.1 ' + jqXHR.status + ' ' + jqXHR.statusText + "\n" + jqXHR.getAllResponseHeaders()
            });
          }

          if (jqXHR.getResponseHeader('Content-Location')) {
            self.addressbar.setUrl(jqXHR.getResponseHeader('Content-Location'));
          } else {
            self.addressbar.setUrl(url);
          }

          if (_.isObject(resource) && ('@type' in resource)) {
            self.showDocumentation(resource['@type'].__value.__value['@id']);
          }
        })
        .fail(function(jqXHR) {
          self.response.model.set({
            data: null,
            headers: 'HTTP/1.1 ' + jqXHR.status + ' ' + jqXHR.statusText + "\n" + jqXHR.getAllResponseHeaders()
          });

          alert('Request failed');
        })
        .always(function() {
          $('#load').addClass('btn-inverse');
        });
    },

    invokeRequest: function(method, url, data, headers) {
      var self = this;

      var settings = {
        'type': method || 'GET',
        'headers': headers || null,
        'processData': false,
        'data': data || null,
        'dataType': 'text'
      };

      var jqxhr = $.ajax('proxy.php?debug=true&url=' + encodeURI(url), settings);

      return jqxhr;
    },

    showDocumentation: function(url) {
      var self = this;

      if ((undefined === url) || (null === url)) {
        return;
      }

      var vocabUrl = url.split('#', 2)[0];

      if (vocabUrl === self.documentation.model.get('vocabUrl')) {
        self.documentation.model.set({ 'type' : url });

        return;
      }

      self.documentation.model.set({ 'type' : null });

      var jqxhr = $.getJSON('proxy.php', { 'url': vocabUrl }, function(resource) {
        //self.vent.trigger('response', { resource: resource });
        // TODO Merge the vocabulary into the documentation model
        var vocab = resource['@graph'];

        self.documentation.model.set({ 'type' : url, 'vocab': vocab, 'vocabUrl': vocabUrl });
      }).error(function() {
        self.documentation.model.set({ 'type' : false, 'vocab': null, 'vocabUrl': null });
      });
    },

    showOperationsModal: function(property, target) {
      var self = this;

      // Operations can
      //    - be associated with the type
      //    - or the property
      //    - or be expressed in-line

      if ((undefined === property) || (null === property)) {
        return;
      }

      var vocabUrl = property.split('#', 2)[0];

      if (vocabUrl === self.documentation.model.get('vocabUrl')) {
        property = self.documentation.model.getElementDefinition(property);

        if ('operations' in property) {
          self.operationsModal.model.update(property.operations, target);
        } else {
          self.operationsModal.model.update(null, target);
        }

        self.operationsModal.widget.modal('show');

        return;
      }

      var jqxhr = $.getJSON('proxy.php', { 'url': vocabUrl }, function(resource) {
        // TODO Merge the vocabulary into the documentation model
        var vocab = resource['@graph'];
        property = self.documentation.model.getElementDefinition(property, vocab);

        if ('operations' in property) {
          self.operationsModal.model.update(property.operations, target);
        } else {
          self.operationsModal.model.update(null, target);
        }

        self.operationsModal.widget.modal('show');
      }).error(function() {
        alert("Can't find documentation for property " + property);
      });
    }
  };

  window.HydraClient = Hydra.Client.initialize();
})();



// ---- Activate tooltips and popovers

$('#addressbar').on("submit", function () {
    window.HydraClient.get($('#url').val());
    return false;
  })
;

$('#response').on("mouseenter", ".prop", function () {
    var property = $(this).attr('data-iri');

    if (property && (0 === property.indexOf('http://'))) {
      window.HydraClient.showDocumentation(property);

      if (document.getElementById(property)) {
        $(document.getElementById(property)).addClass("prop-highlight");
      }
    }
  })
;

$('#response').on("mouseleave", ".prop", function () {
    var property = $(this).attr('data-iri');
    if (property && document.getElementById(property)) {
      $(document.getElementById(property)).removeClass("prop-highlight");
    }
  })
;

// $('#response').on("mouseenter", ".context", function () {
//     var property = $(this).attr('data-original-title') || $(this).attr('title');
//     if (property && document.getElementById(property)) {
//       $(document.getElementById(property)).addClass("prop-highlight");
//     }
//   })
// ;

// $('#response').on("mouseleave", ".context", function () {
//     var property = $(this).attr('data-original-title') || $(this).attr('title');
//     if (property && document.getElementById(property)) {
//       $(document.getElementById(property)).removeClass("prop-highlight");
//     }
//   })
// ;



$(document).ready(function() {
  window.HydraClient.showDocumentation();
  //window.HydraClient.get('http://hydra.test/users/1');
  window.HydraClient.get('http://hydra.test/app_dev.php/');
  $('#url').focus();
});
