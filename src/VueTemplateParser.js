module.exports = class VueTemplateParser
{
    constructor(template, parentComponent = false)
    {
        this.validHtmlTags = require('html-tags');
        this.minify = require('html-minifier').minify;

        this.parentComponent = parentComponent;

        this.tasks = [
            'getComponentName',
            'parseTemplate',
            'getComponent',
            'getComponentTemplate',
            'parseComponentTemplate',
            'parseChildNodes',
        ];

        this.template = template;
        this.componentName = null;
        this.componentTemplate = null;
        this.parsedComponentTemplate = null;
        this.result = {
            component: null,
            config: {
                slots: {
                    default: null,
                },
            },
        };

        this.htmlResult = null;
    }

    static parse(template, parentComponent = false)
    {
        let parser = new this(template, parentComponent);

        parser.tasks.forEach(task => {
            parser[task]();
        });

        parser.result.component = parser.component;

        if (parser.parentComponent) {
            return parser.template;
        }

        if (parser.parentComponent && parser.htmlResult) {
            return parser.htmlResult;
        }

        return parser.result;
    }

    getComponentName()
    {
        let matches = this.template.match(/<([^\s>]+)(\s|>)+/);

        if (! matches) {
            this.htmlResult = this.template;

            return;
        }

        this.componentName = matches[1];
    }

    parseTemplate()
    {
        this.parsedTemplate = counsel.serviceProviders.cheerio.load(this.template, {
            withDomLvl1: false,
            xmlMode: true,
        });
    }

    getComponent()
    {
        if (! this.componentName) {
            return;
        }

        this.component = Vue.options.components[this.componentName];

        if (! this.component && ! this.isValidHtmlTag() && this.parentComponent && this.parentComponent.sealedOptions && this.parentComponent.sealedOptions.components) {
            console.log(Object.keys(this.parentComponent.sealedOptions.components));
            this.component = this.parentComponent.sealedOptions.components[this.componentName];
        }

        if (! this.component && ! this.isValidHtmlTag()) {
            throw new Error(`Component [${this.componentName}] don't exists.`);
        }
    }

    getComponentTemplate()
    {
        if (! this.isValidHtmlTag() && this.componentName) {
            if (this.component.options && this.component.options.template) {
                this.componentTemplate = this.component.options.template;
            } else if (this.component.template) {
                this.componentTemplate = this.component.template;
            }
        }
    }

    parseComponentTemplate()
    {
        if (! this.componentTemplate) {
            this.parsedComponentTemplate = counsel.serviceProviders.cheerio.load(`<${this.componentName}></${this.componentName}`);
            return;
        }

        this.parsedComponentTemplate = counsel.serviceProviders.cheerio.load(this.componentTemplate, {
            withDomLvl1: false,
            xmlMode: true,
        });
    }

    parseChildNodes()
    {
        this.result.config.slots.default = '';

        this.defaultSlot = '';

        let defaultSlot = '';

        this.parsedComponentTemplate.root().children().first().children().each((index, element) => {
            let child = counsel.serviceProviders.cheerio(element);

            // console.log(element.name);

            if (! this.isValidHtmlTag(element.name)) {
                // console.log(`<${element.name}>${child.html()}</${element.name}>`);
                let childComponent = VueTemplateParser.parse(
                    `<${element.name}>${child.html()}</${element.name}>`,
                    this.component
                );

                // console.log(childComponent);
            }

            let children = child.children();

            if (children.length > 0) {
                // let childComponent = new VueComponentTestWrapper(
                //     VueTemplateParser.parse(child.html())
                // );

                // console.log(childComponent);
            }
        });

        let componentTemplateDefaultSlotExists = this.parsedComponentTemplate.root().find('slot:not([name])').length;

        let defaultSlotElement = false;

        if (componentTemplateDefaultSlotExists) {
            defaultSlotElement = this.parsedTemplate(this.componentName);
        }

        this.parsedComponentTemplate.root().find('slot[name]').each((index, element) => {
            let child = counsel.serviceProviders.cheerio(element);
            let namedSlotElement = this.parsedTemplate(`[slot="${child.attr('name')}"]`);
            let namedSlotName = namedSlotElement[0].name;
            let namedSlotHtml = `<${namedSlotName}>${namedSlotElement.html()}</${namedSlotName}>`;

            if (defaultSlotElement) {
                defaultSlotElement.find(`${namedSlotName}[slot="${child.attr('name')}"]`).remove();
            }

            this.result.config.slots[child.attr('name')] = VueTemplateParser.parse(namedSlotHtml, this.component);
        });

        if(defaultSlotElement && defaultSlotElement.length > 0) {
            let defaultSlotParentName = this.parsedComponentTemplate('slot').not('[name]').parent()[0].name;
            let cleanComponentTemplate = this.componentTemplate.replace(/\s+/g, '');
            let cleanSlotParentHtml = counsel.serviceProviders.cheerio.html(this.parsedComponentTemplate('slot').not('[name]').parent()).replace(/\s+/g, '');

            if (cleanSlotParentHtml != cleanComponentTemplate) {
                this.parsedComponentTemplate('slot').not('[name]').parent().replaceWith('<slot></slot>');
                this.component.options.template = this.parsedComponentTemplate.html();

                this.result.config.slots.default += VueTemplateParser.parse(
                    `<${defaultSlotParentName}>${this.minifyHtml(defaultSlotElement.html())}</${defaultSlotParentName}>`,
                    this.component
                );
            } else {
                this.result.config.slots.default += VueTemplateParser.parse(defaultSlotElement.html(), this.component);
            }
        }
    }

    minifyHtml(html)
    {
        return this.minify(html, { collapseWhitespace: true })
    }

    isValidHtmlTag(name = false)
    {
        if (! name) {
            name = this.componentName;
        }

        return this.validHtmlTags.includes(this.componentName);
    }
}