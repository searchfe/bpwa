/**
 * @file schema
 * @author mj(zoumiaojiang@gmail.com)
 */

const gData = require('./data');

/**
 * 获取和初始化 pwa 项目相关的 fields
 *
 * @return {Object} 返回的 fields
 */
exports.getSchema = async function () {
    let data = await gData();
    let properties = data.schemas;
    let keys = Object.keys(properties);

    for (let key of keys) {
        let item = properties[key];

        if (item.type === 'list') {
            if (item.link && !item.dependence) {
                properties[key].list = data[item.link];
            }
            else if (item.dependence) {
                let depList = properties[item.dependence].list;

                depList.forEach(depItem => {
                    if (depItem.value === data.defaults[item.dependence]) {
                        properties[key].list = depItem.subList ? (depItem.subList[key] || []) : [];
                    }
                });
            }
        }
    }

    return {properties};
};

/**
 * 获取 json schema, 用于验证 json 表单
 *
 * @return {Object} 返回的json schema
 */
exports.getJsonSchema = async function () {
    let data = await gData();
    let schemas = data.schemas;
    let properties = {};
    let required = [];
    let dependence = {};

    Object.keys(schemas).forEach(key => {
        let item = schemas[key];

        if (!item.disable) {
            properties[key] = {
                type: item.jsonType || item.type,
                description: item.description
            };

            if (item.regExp) {
                properties[key].pattern = item.regExp;
            }

            if (item.required) {
                required.push(key);
            }
        }
    });

    return {
        type: 'object',
        description: 'lavas scaffold json schema',
        properties,
        required,
        dependence
    };
};
