const { Parser } = require('../out/parser.js')

describe('FTE Parser Tests (upstream snapshots)', () => {
  describe('Basic Template Tags', () => {
    test('should parse code tag <%', () => {
      const template = '<% const x = 1; %>'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should parse escaped output tag <%=', () => {
      const template = '<%= value %>'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should parse unescaped output tag <%-', () => {
      const template = '<%- html %>'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should parse comment tag <%#', () => {
      const template = '<%# This is a comment %>'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })

  describe('Special Endings', () => {
    test('should handle trimmed ending -%>', () => {
      const template = '<% if (true) { -%>\nNext line'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle whitespace slurping ending _%>', () => {
      const template = '<% if (true) { _%>    Next'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })

  describe('Blocks and Slots', () => {
    test('should parse block definition', () => {
      const template = '<# block "content": #>\nBlock content\n<# end #>'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should parse slot definition', () => {
      const template = '<# slot "header": #>\nSlot content\n<# end #>'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })

  describe('Directives', () => {
    test('should parse extend directive', () => {
      const template = '<#@ extend("layout.ftl") #>\nContent'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should parse context directive', () => {
      const template = '<#@ context("customContext") #>\nContent'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should parse multiple directives', () => {
      const template = `
        <#@ extend("layout.ftl") #>
        <#@ context("customContext") #>
        <#@ deindent(2) #>
        Content
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })

  describe('Mixed Content', () => {
    test('should handle mixed template content', () => {
      const template = `
        <#@ extend("layout.ftl") #>
        <# block "content": #>
          <% if (user) { %>
            Hello, <%= user.name %>!
          <% } %>
        <# end #>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })

  describe('Edge Cases', () => {
    test('should handle nested curly braces', () => {
      const template = '<%= { nested: { value: 123 } } %>'
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle empty template', () => {
      const template = ''
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle template with only whitespace', () => {
      const template = '   \n   \t   '
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })

  describe('Multiline Content', () => {
    test('should handle multiline code blocks', () => {
      const template = `<%
        const x = 1;
        const y = 2;
        const sum = x + y;
      %>`
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle multiline expressions', () => {
      const template = `<%=
        user.firstName +
        ' ' +
        user.lastName
      %>`
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle multiline blocks with mixed content', () => {
      const template = `
        <# block "content": #>
          <% if (user) { %>
            Hello,
            <%= user.name %>!
            How are you today?
          <% } %>
        <# end #>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle multiline directives', () => {
      const template = `
        <#@ extend("layout.ftl") #>
        <#@ context(
          "customContext"
        ) #>
        Content
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should preserve indentation in multiline content', () => {
      const template = `
        <% if (condition) { %>
          <div class="indented">
            <%= user.name %>
            <% for (const item of items) { %>
              <div class="item">
                <%= item.value %>
              </div>
            <% } %>
          </div>
        <% } %>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })

  describe('Chunks and Templates', () => {
    test('should handle chunks with multiple files', () => {
      const template = `
        <#@ chunks 'main.file.txt' #>
        <#@ noEscape #>
        <#@ includeMainChunk #>

        <# chunkStart("filename1.txt") #>
        file1

        <# chunkStart("filename2.txt")#>
        file2

        <# chunkStart("filename3.txt") #>
        file3

        <# chunkEnd() #>
        !!!
        <# chunkStart("filename4.txt") #>
        file4
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle template with alias and requires', () => {
      const template = `
        <#@ alias 'raw.njs' #>
        <#@ noContent #>
        <#@ requireAs ('MainTemplate.njs','core') #>
        (function(){
          return #{partial(context, 'core')};
        })();
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle mixed chunks and expressions', () => {
      const template = `
        <#@ chunks 'output.txt' #>
        <# chunkStart("header.txt") #>
        <%= title %>
        ---------------
        <# chunkEnd() #>

        <# chunkStart("content.txt") #>
        <% for(let item of items) { %>
          - <%= item.name %>: <%= item.value %>
        <% } %>
        <# chunkEnd() #>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle nested expressions in chunks', () => {
      const template = `
        <#@ chunks 'nested.txt' #>
        <# chunkStart("main.txt") #>
        <%= user.name %>'s Profile
        <% if (user.details) { %>
          <%= user.details.map(detail => { %>
            * <%= detail.key %>: <%= detail.value %>
          <% }).join('\\n') %>
        <% } %>
        <# chunkEnd() #>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle complex template with multiple directives', () => {
      const template = `
        <#@ alias 'complex.njs' #>
        <#@ noContent #>
        <#@ requireAs ('BaseTemplate.njs','base') #>
        <#@ requireAs ('HelperFunctions.njs','helpers') #>
        <#@ chunks 'output' #>

        <# chunkStart("template.js") #>
        (function(){
          const helpers = #{partial(context, 'helpers')};
          const base = #{partial(context, 'base')};

          <% for(let func of functions) { %>
            <%= helpers[func.name] %>(
              <%= func.args.join(', ') %>
            );
          <% } %>

          return base.compile(result);
        })();
        <# chunkEnd() #>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })

  describe('HTML Templates', () => {
    test('should handle template inheritance with partials', () => {
      const template = `
        <#@ alias "index" #>
        <#@ extend 'template.nhtml' #>
        <section>
          #{partial(context, 'panel')}
        </section>
        <section>
        <# var extra = { title: 'Another panel!!!', body:'extra content'}#>
          #{partial(extra, 'panel')}
        </section>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle panel with blocks and context', () => {
      const template = `
        <#@ alias "panel" #>
        <#@ context 'panel' #>
        <#- block 'title' : -#>
        <#@ context 'title' #>
          <div class="panel-heading">
            <h3 class="panel-title">#{title}</h3>
          </div>
        <#- end -#>
        <#- block 'body' : -#>
        <#@ context 'body' #>
          <div class="panel-body">
            #{body}
          </div>
        <#- end -#>
        <div class="panel panel-default">
          #{content('title', panel.title)}
          #{content('body', panel.body)}
          #{content()}
          <p> sample text! </p>
        </div>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle complex diagram template with chunks', () => {
      const template = `
        <#@ context "diagram" #>
        <#@ alias "model-root" #>
        <#@ chunks "$$$main$$$" #>
        <#@ deindent #>
        <#- chunkStart(` + "`root.plantuml`" + `); -#>
        <#
        const association = {
          "inheritance": ["<|","|>"],
          "composition": "*",
          "aggregation": "o",
          "navigable":["<",">"]
        }

        const dependency = {
          "implement":["<|", "|>"],
          "depends":["<", ">"]
        }
        #>
        @startuml diagram
        !theme sketchy-outline

        <#- diagram.namespaces.forEach(namespace => {#>
        package #{namespace.name} {}
        <#- })#>

        <#- diagram.things.forEach(thing => {#>
        class #{thing.thingType} {
        <# thing.properties.forEach(prop=> {#>
          #{prop.propertyName}:#{prop.type ?? "String"}
        <#})#>
        __ server methods __
        <#- thing.methods.forEach(method=> {#>
          #{method.name}()
        <#})#>
        __ client methods __
        <#- thing.clientMethods.forEach(method=> {#>
          #{method.name}()
        <#})#>
        }
        <#- })#>

        @enduml
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle mixed expressions with HTML', () => {
      const template = `
        <div class="container">
          <#@ context "page" #>
          <nav class="navbar">
            <% if (user.isAdmin) { %>
              <div class="admin-panel">
                <%= user.role %>
                <#- block "adminControls": -#>
                  <div class="controls">
                    #{partial(context, 'adminMenu')}
                  </div>
                <#- end -#>
              </div>
            <% } %>
          </nav>
          <main>
            #{content()}
            <#- navigation.items.forEach(item => { -#>
              <a href="#{item.url}" class="#{item.active ? 'active' : ''}">
                #{item.label}
              </a>
            <#- }) -#>
          </main>
        </div>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle template with multiple context switches', () => {
      const template = `
        <#@ context "root" #>
        <div class="wrapper">
          <#@ context "header" #>
          <header>
            #{title}
            <#- block "navigation": -#>
              <#@ context "nav" #>
              <nav>
                <% menu.items.forEach(item => { %>
                  <a href="<%= item.url %>">#{item.text}</a>
                <% }) %>
              </nav>
            <#- end -#>
          </header>
          <#@ context "main" #>
          <main>
            #{partial(context, 'content')}
            <#- block "sidebar": -#>
              <#@ context "sidebar" #>
              <aside>
                #{widgets.map(w => partial(w, 'widget')).join('')}
              </aside>
            <#- end -#>
          </main>
        </div>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })

  describe('React Component Templates', () => {
    test('should handle base show component template', () => {
      const template = `
        <#@ context "entity" -#>
        <#@ alias 'forms-show-base' -#>

        import React from "react";
        import PropTypes from 'prop-types';
        import {
          #{content('import-from-react-admin')}
          #{slot('import-from-react-admin-show')}
        } from "react-admin";
        #{slot('import-from-ra-ui-components-show')}
        const ShowRecordView = (props, context) => {
          const { uix } = context;
          const { Title } = uix['#{entity.role}/#{entity.name}'];
        <#-
        const manyRels = entity.relations.filter(f => !f.single);
        if(manyRels.length > 0){#>
        <#
         const uniqueEntities = manyRels.filter(f=> !f.single)
          .reduce((hash, curr)=> {
            hash[curr.ref.entity] = curr;
            return hash;
          }, {});

          Object.keys(uniqueEntities).forEach(key=>{
            let f = uniqueEntities[key];
        -#>
          const #{f.ref.entity} = uix['#{entity.role}/#{f.ref.entity}'];
        <#})-#>
        <#-}#>
          return (
        <#- slot('import-from-react-admin-show', 'Show')#>
            <Show title={<Title />} {...props}>
              #{content('view')}
            </Show>
          );
        };

        ShowRecordView.contextTypes = {
          uix: PropTypes.object.isRequired,
          translate: PropTypes.func.isRequired,
        }

        export default ShowRecordView;
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle show field template', () => {
      const template = `
        <#@ context "ctx" -#>
        <#@ alias 'show-field' -#>
        <#-
          const {entity, f} = ctx;
        -#>
        <#-
        const type = (f.type=="Number" ? "Text" : f.type) + 'Field';
        if(f.type === 'JSON'){
          slot('import-from-ra-ui-components-show', '$' + '{type}');
        } else {
          slot('import-from-react-admin-show', '$' + '{type}');
        }
        -#>
        <#\${type}
          label="resources.#{entity.name}.fields.#{f.name}"
          source="#{f.name}"
        />
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle single embedded relation template', () => {
      const template = `
        <#@ context "ctx" -#>
        <#@ alias 'show-rel-single-embed' -#>
        <#-
          const {entity, f, current} = ctx;
        -#>
        <#- slot('import-from-ra-ui-components-show','EmbeddedField') #>
        <#- slot('import-from-react-admin-show','ShowButton') #>
        <#- slot('import-from-react-admin-show','EditButton') #>
        <#- slot('import-from-react-admin-show','DeleteButton') -#>
        <EmbeddedField
          addLabel={false}
          source="#{f.field}Value"
        >
        <#
          let embededEntity = entity.UI.embedded.items[current].entity;
          let reUI = entity.UI.embedded.items[current].UI;
          entity.UI.embedded.items[current].fields
          .filter(f=>
            f.name !== 'id' &&
            (reUI.edit[f.name] ||
            reUI.list[f.name] ||
            reUI.show[f.name]) &&
            reUI.show[f.name] !== false)
          .forEach(f=>{-#>
          <#\${f.type=="Number" ? "Text" : f.type}Field
            label="resources.#{embededEntity}.fields.#{f.name}"
            source="#{f.name}"
          />
        <#
                });
        -#>
          <DeleteButton basePath="/#\${entity.role}/#\${f.ref.entity}"/>
        </EmbeddedField>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle import from components template', () => {
      const template = `
        <#@ context 'items' #>
        <#@ alias
          'import-from-ra-ui-components-show'
          'import-from-ra-ui-components-form'
        -#>
        <#- const separatedItems = Object.keys(items
          .reduce((res, it) => {
            it.split(',')
              .map(i=>i.trim())
              .filter(f=>f)
              .reduce((r,cur)=>{
                r[cur]=1;
                return r;
              },res);
            return res;
          }, {}));
        -#>
        <#- if(separatedItems.length > 0){-#>
        import { components } from 'oda-ra-ui';
        const {
        <#-
            separatedItems.forEach(item=>{
        #>
          #{item.trim()},
        <#  });-#>
        } = components;
        <#}-#>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle complex slot and content interactions', () => {
      const template = `
        <#@ context "entity" -#>
        <#@ alias 'complex-component' -#>

        import React from 'react';
        import {
          #{content('base-imports')}
          #{slot('additional-imports')}
        } from 'react-admin';

        <#- slot('component-imports') #>

        const #{\${entity.name}}Component = ({
          #{content('props')}
          #{slot('additional-props')}
        }) => {
          <#- slot('hooks') #>

          return (
            <div className="#\${entity.name.toLowerCase()}-component">
              #{content('render')}
              <#- slot('additional-render') #>
            </div>
          );
        };

        #{content('prop-types')}
        <#- slot('additional-prop-types') #>

        export default #{\${entity.name}}Component;
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })

    test('should handle nested slots with conditions', () => {
      const template = `
        <#@ context "ctx" -#>
        <#@ alias 'nested-slots' -#>

        <#- const { entity, fields } = ctx; -#>
        <div>
          <#- if (fields.length > 0) { -#>
            <#- slot('before-fields') #>
            <#- fields.forEach(field => { -#>
              <div class="field-wrapper">
                <#- slot(` + "`field-${field.type}`" + `) #>
                #{content(` + "`field-content-${field.name}`" + `)}
                <#- if (field.hasValidation) { -#>
                  <#- slot('validation-messages') #>
                <#- } -#>
              </div>
            <#- }); -#>
            <#- slot('after-fields') #>
          <#- } else { -#>
            <#- slot('no-fields') #>
          <#- } -#>
        </div>
      `
      const result = Parser.parse(template)
      expect(result).toMatchSnapshot()
    })
  })
})
