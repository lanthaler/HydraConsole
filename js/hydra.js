(function() {
  var Hydra = {
    Models: {},
    Views: {}
  };

  Hydra.Models.Response = Backbone.Model.extend({
  });


  Hydra.Models.Documentation = Backbone.Model.extend({
    promptColor: function() {
      var cssColor = prompt("Please enter a CSS color:");
      this.set({color: cssColor});
    }
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

      // If the property is the value of a keyword, simply GET it, otherwise show dialog
      if ('@' === property[0]) {
        window.HydraClient.get(uri);
      } else {
        window.HydraClient.showOperationsModal(property, uri);
      }
    },

    render: function() {
      this.$el.html(this.renderResponse(this.model.get('data'), '', false));
      $('.prop-key').tooltip({ 'placement': 'right' });
      $('.context').popover( {
        'trigger': 'hover',
        'placement': 'right',
        'title': 'Active context'
      });
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
        if ('__orig_value' in data) {  // it was a literal
          result += '<span class="literal" title="';
          result += _.escape(JSON.stringify(data.__value)) + '">';

          if ('@id' in data.__value) {
            result += '<a href="' + data.__value['@id'] + '">';
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
        this.title.html(_.escape(type.short_name));
        this.details.html(this.template({ 'docu': type }));
      }
      return this;
    }

  });


  Hydra.Views.OperationsModal = Backbone.View.extend({
    el: $("#operationsModal"),
    body: $("#operationsModal"),
    template: _.template($('#operationsModal-template').html()),

    initialize: function() {
      this.model.bind('change', this.render, this);

      $('#operationsModal-template').remove();
    },

    /*events: {
      "click .icon":          "open",
      "click .button.edit":   "openEditDialog",
      "click .button.delete": "destroy"
    },*/

    render: function() {
      var self = this;

      self.body.html(self.template(self.model.toJSON()));

      self.body.on("click", ".operation", function () {
        self.model.set({ 'selected': $(this).attr('data-index') });
      });

      return this;
    }

  });


  var documentationModel = new Hydra.Models.Documentation();

  Hydra.Client = {
    addressbar: new Hydra.Views.AddressBar(),
    documentationView: new Hydra.Views.Documentation( {
      model: documentationModel
    }),
    documentationModel: documentationModel,
    documentation: {},
    response: {},
    operationsModal: { widget: $('#operationsModal') },

    initialize: function() {
      $.ajaxSetup({
       headers: { 'Accept': 'application/ld+json, application/json;q=0.1' }//,
       //cache: false
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
        model: this.operationsModal.model
      });

      return this;
    },

    get: function(url) {
      var self = this;

      url = url || self.addressbar.getUrl();

      $('#load').removeClass('btn-inverse');

      var jqxhr = $.getJSON('proxy.php', { 'debug': true, 'url': url }, function(resource) {
        //self.vent.trigger('response', { resource: resource });

        self.response.model.set({ data: resource });
        self.addressbar.setUrl(url);

        if (_.isObject(resource) && ('@type' in resource)) {
          self.showDocumentation(resource['@type'].__value.__value['@id']);
        }
      }).error(function() {
        alert('Request failed');
        self.vent.trigger('fail-response', { jqxhr: jqxhr });
      }).complete(function() {
        $('#load').addClass('btn-inverse');
      });
    },

    showDocumentation: function(url) {
      var self = this;

      if ((undefined === url) || (null === url)) {
        return;
      }

      var vocabUrl = url.split('#', 2)[0];

      if (vocabUrl === self.documentation.model.get('vocabUrl')) {
        var vocab = self.documentation.model.get('vocab');
        self.documentation.model.set({ 'type' : self.findType(vocab, url) });

        return;
      }

      self.documentation.model.set({ 'type' : null });

      var jqxhr = $.getJSON('proxy.php', { 'url': vocabUrl }, function(resource) {
        //self.vent.trigger('response', { resource: resource });
        var vocab = resource['@graph'];
        var type = self.findType(vocab, url);

        self.documentation.model.set({ 'type' : type, 'vocab': vocab, 'vocabUrl': vocabUrl });
      }).error(function() {
        self.documentation.model.set({ 'type' : false, 'vocab': null, 'vocabUrl': null });
      });
    },

    findType: function(vocab, url) {
      var type = _.find(vocab, function(entry) {
        return entry['@id'] === url;
      });

      if ('rdfs:Class' !== type['@type']) {
        type = _.find(vocab, function(entry) {
          return entry['@id'] === type.domain;
        });
      }

      type.properties = _.filter(vocab, function(entry) {
        return entry['domain'] === type['@id'];
      });

      return type;
    },

    findElement: function(vocab, url) {
      var element = _.find(vocab, function(entry) {
        return entry['@id'] === url;
      });

      return element;
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
        var vocab = self.documentation.model.get('vocab');
        property = self.findElement(vocab, property);

        if ('operations' in property) {
          self.operationsModal.model.update(property.operations, target);
        } else {
          self.operationsModal.model.update(null, target);
        }

        self.operationsModal.widget.modal('show');

        return;
      }

      var jqxhr = $.getJSON('proxy.php', { 'url': vocabUrl }, function(resource) {
        var vocab = resource['@graph'];
        property = self.findElement(vocab, property);

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
    window.HydraClient.get();
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
  $('#url').focus();
});
