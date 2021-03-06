/**
 * @file 操作 template
 * @author mj(zoumiaojiang@gmail.com)
 */

const git = require('simple-git');
const glob = require('glob');
const archiver = require('archiver');
const etpl = require('etpl');
const fs = require('fs-extra');
const path = require('path');

const conf = require('./config');
const gData = require('./data');

/**
 * 从git上downloa代码下来
 *
 * @param  {string} repo       git repo
 * @param  {string} targetPath 存储的目标目录
 * @return {Promise}           promise 对象
 */
function downloadFromGit(repo, targetPath) {
    return new Promise((resolve, reject) => {

        // 如果当前文件系统有 download 的缓存，就不重新 clone 了，将代码直接 pull 下来就好了。
        if (fs.existsSync(targetPath)) {
            git(targetPath).pull((err, updates) => resolve(targetPath));
        }
        else {
            fs.mkdirsSync(targetPath);
            git().clone(repo, targetPath, {}, () => resolve(targetPath));
        }
    });
}

/**
 * 渲染 template 里面的所有文件
 *
 * @param  {Object} fields    收集的用户输入字段
 * @param  {string} ltd       临时文件夹存储路径
 * @param  {Object} template  template 对象
 * @param  {boolean} isStream  导出的是否为流
 * @return {Promise}          渲染 promise
 */
function renderTemplate(fields, ltd, template, isStream) {
    let dirPath = fields.dirPath || process.cwd();
    let etplCompile = new etpl.Engine(template.etpl || {
        commandOpen: '{%',
        commandClose: '%}',
        variableOpen: '*__',
        variableClose: '__*'
    });

    return new Promise((resolve, reject) => {
        glob(
            '**/*',
            {
                cwd: ltd,
                ignore: [
                    'node_modules',
                    '**/*.tmp', '**/*.log',
                    '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.bmp', '**/*.gif', '**/*.ico',
                    '**/*.svg', '**/*.woff', '**/*.ttf'
                ].concat(template.renderIgnores || [])
            },
            (err, files) => {
                files.forEach(file => {
                    let filePath = path.resolve(ltd, file);

                    if (fs.statSync(filePath).isFile()) {

                        let fileCon = fs.readFileSync(filePath, 'utf8');

                        // 这里可以直接通过外界配置的规则，重新计算出一份数据，只要和 template 里面的字段对应上就好了。
                        let extDataTpls = template.extData || {};
                        let extData = {};
                        let commonData = conf.COMMON_DATA;

                        Object.keys(extDataTpls).forEach(key => {
                            extData[key] = etplCompile.compile('' + extDataTpls[key])(fields);
                        });

                        let renderData = Object.assign({}, fields, extData, commonData);
                        let afterCon = etplCompile.compile(fileCon)(renderData);

                        fs.writeFileSync(filePath, afterCon);
                    }
                });

                if (isStream) {
                    let archive = archiver('zip', {
                        zlib: {level: 9} // Sets the compression level.
                    });
                    let tmpZipPath = path.resolve(ltd, '..', 'tmp.zip');
                    let output = fs.createWriteStream(tmpZipPath);

                    archive.pipe(output);
                    archive.directory(ltd, fields.name);
                    archive.finalize().on('finish', () => resolve(fs.createReadStream(tmpZipPath)));
                }
                else {
                    fs.copySync(ltd, dirPath);
                    resolve(dirPath);
                }
            }
        );
    });
}

/**
 * 导出某一个模版
 *
 * @param {Object} fields  导出模版所需字段
 * @param {boolean} isStream  导出的是否为流
 * @return {any}              导出的结果
 */
exports.exportsTemplate = async function (fields, isStream) {
    let data = await gData();
    let fwobj;
    let tobj;

    // 这里说明一下， 没办法做到完全解耦， 必须传入 fields.framework 字段，也就是必须得指定一个 framework
    // 在 GLOBAL_CONF_URL 对应的必须得有 framework 这个 property，否则 run 不起来
    for (let framework of data.frameworks) {
        if (framework.value === fields.framework || framework.value === data.defaults.framework) {
            fwobj = framework;
        }
    }

    for (let template of fwobj.subList.template) {
        if (template.value === fields.template || template.value === data.defaults.template) {
            tobj = template;
        }
    }
    let gitRepo = tobj.git;
    let ltd = path.resolve(conf.LOCAL_TEMPLATES_DIR, `${Date.now()}`);
    let tltd = path.resolve(
        conf.LOCAL_TEMPLATES_DIR,
        fields.framework || data.defaults.framework,
        fields.template || data.defaults.template,
        'templates'
    );

    fs.mkdirsSync(ltd);
    await downloadFromGit(gitRepo, tltd);
    fs.copySync(tltd, ltd);

    // 把指定的文件和文件夹都删掉
    (tobj.exportsIgnores || [
        '.git',
        'docs'
    ]).forEach(fileOrDir => {
        let filePath = path.resolve(ltd, fileOrDir);

        if (fs.existsSync(filePath)) {
            fs.removeSync(filePath);
        }
    });

    fields = Object.assign({}, fields, data.defaults);

    let renderResult = await renderTemplate(fields, ltd, tobj, isStream);
    fs.removeSync(ltd);

    return renderResult;
};

