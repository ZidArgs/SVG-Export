import fs from "fs";
import path from "path";
import {exec} from "child_process";

const ENV_PATTERN = /^%.*%$/;
const TEMPLATE_PLACEHOLDER = /\$\{(.*?)\}/;
const __DIR__ = path.resolve("./");

const COMMANDS = {"textToPath": "--export-text-to-path"};

// default config
const DEFAULT_CONFIG = {
    targetFolder: "./export",
    outputFilename: "${basename}_${size}",
    outputFileType: "png",
    inkscapePath: process.env.INKSCAPE_PATH ?? "C:\\Program Files\\Inkscape\\bin\\inkscape.exe",
    sourceFolder: __DIR__,
    demoMode: false,
    silenceConverter: true,
    silenceIgnored: true
};
// load config
const CONFIG = (function() {
    const configPath = path.join(__DIR__, "svg_export.json");
    if (!fs.existsSync(configPath)) {
        return DEFAULT_CONFIG;
    } else {
        const config = JSON.parse(fs.readFileSync(configPath).toString());
        if (config.sourceFolder) {
            config.sourceFolder = path.resolve(config.sourceFolder);
        }
        if (config.inkscapePath) {
            if (ENV_PATTERN.test(config.inkscapePath)) {
                const envName = config.inkscapePath.slice(1, -1);
                config.inkscapePath = path.resolve(process.env[envName] ?? "");
            } else {
                config.inkscapePath = path.resolve(config.inkscapePath);
            }
        }
        return {
            ...DEFAULT_CONFIG,
            ...config
        };
    }
})();

function applyTemplate(text, values) {
    let match;
    while ((match = TEMPLATE_PLACEHOLDER.exec(text)) != null) {
        const substitute = values[match[1]] || "";
        text = text.replace(match[0], substitute);
    }
    return text;
}

function createCommandsFromOptions(options) {
    const result = [];
    for (const option in options) {
        const value = options[option];
        if (typeof value === "boolean") {
            if (value && option in COMMANDS) {
                result.push(COMMANDS[option]);
            }
        } else if (typeof value === "string" || typeof value === "number") {
            if (option in COMMANDS) {
                result.push(`${COMMANDS[option]}="${value}"`);
            }
        }
    }
    if (result.length) {
        return result.join(" ");
    }
    return "";
}

//check if folder needs to be created or integrated
function createTargetFolder(targetFolder) {
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder);
    }
}

function convertToSVG(sourcePath, targetPath, outputTemplate, options) {
    return new Promise((resolve) => {
        const sourceStat = fs.lstatSync(sourcePath);
        const srcMTime = sourceStat.mtime.valueOf();
        const basename = path.basename(sourcePath, ".svg");
        const targetBasename = applyTemplate(outputTemplate, {
            type: "svg",
            basename
        });
        const targetFileName = targetBasename.endsWith(`.svg`) ? targetBasename : `${targetBasename}.svg`;
        const targetFilePath = path.join(targetPath, targetFileName);
        const commands = createCommandsFromOptions(options);
        if (CONFIG.demoMode) {
            console.log(`"${CONFIG.inkscapePath}" "${sourcePath}" ${commands} --export-filename="${targetFilePath}"`);
            resolve();
        } else {
            if (fs.existsSync(targetFilePath)) {
                const targetStat = fs.lstatSync(targetFilePath);
                const targetMTime = targetStat.mtime.valueOf();
                if (srcMTime < targetMTime) {
                    if (!CONFIG.silenceIgnored) {
                        const logCommands = JSON.stringify(options ?? {});
                        console.log(`ignore file (not newer): "${sourcePath}" [svg] ${logCommands} -> "${targetFilePath}"`);
                    }
                    resolve();
                    return;
                }
            }

            exec(
                `"${CONFIG.inkscapePath}" "${sourcePath}" ${commands} --export-filename="${targetFilePath}"`,
                (error, stdout, stderr) => {
                    const logCommands = JSON.stringify(options ?? {});
                    if (error) {
                        console.error(`error converting file: "${sourcePath}" [svg] ${logCommands}\n${error.message}`);
                        resolve();
                        return;
                    }
                    console.log(`converted file: "${sourcePath}" [svg] ${logCommands} -> "${targetFilePath}"`);
                    if (!CONFIG.silenceConverter) {
                        if (stdout) {
                            console.log(stderr);
                        }
                        if (stderr) {
                            console.error(stderr);
                        }
                    }
                    resolve();
                    return;
                }
            );
        }
    });
}

function convertFile(sourcePath, targetPath, outputTemplate, type, sizes, options) {
    const sourceStat = fs.lstatSync(sourcePath);
    const srcMTime = sourceStat.mtime.valueOf();
    const basename = path.basename(sourcePath, ".svg");
    const promises = [];
    for (const {
        w = 0,
        h = 0
    } of sizes) {
        promises.push(new Promise((resolve) => {
            if (w <= 0 || h <= 0) {
                resolve();
                return;
            }
            const size = w === h ? `${w}` : `${w}x${h}`;
            const targetBasename = applyTemplate(outputTemplate, {
                size,
                type,
                basename
            });
            const targetFileName = targetBasename.endsWith(`.${type}`) ? targetBasename : `${targetBasename}.${type}`;
            const targetFilePath = path.join(targetPath, targetFileName);
            const commands = createCommandsFromOptions(options);
            if (CONFIG.demoMode) {
                console.log(`"${CONFIG.inkscapePath}" "${sourcePath}" --export-type=${type} --export-width=${w} --export-height=${h} ${commands} --export-filename="${targetFilePath}"`);
            } else {
                if (fs.existsSync(targetFilePath)) {
                    const targetStat = fs.lstatSync(targetFilePath);
                    const targetMTime = targetStat.mtime.valueOf();
                    if (srcMTime < targetMTime) {
                        if (!CONFIG.silenceIgnored) {
                            const logCommands = JSON.stringify(options ?? {});
                            console.log(`ignore file (not newer): "${sourcePath}" [${type}:${w}x${h}] ${logCommands} -> "${targetFilePath}"`);
                        }
                        resolve();
                        return;
                    }
                }
                exec(
                    `"${CONFIG.inkscapePath}" "${sourcePath}" --export-type=${type} --export-width=${w} --export-height=${h} ${commands} --export-filename="${targetFilePath}"`,
                    (error, stdout, stderr) => {
                        const logCommands = JSON.stringify(options ?? {});
                        if (error) {
                            console.error(`error converting file: "${sourcePath}" [${type}:${w}x${h}] ${logCommands}\n${error.message}`);
                            resolve();
                            return;
                        }
                        console.log(`converted file: "${sourcePath}" [${type}:${w}x${h}] ${logCommands} -> "${targetFilePath}"`);
                        if (!CONFIG.silenceConverter) {
                            if (stdout) {
                                console.log(stderr);
                            }
                            if (stderr) {
                                console.error(stderr);
                            }
                        }
                        resolve();
                        return;
                    }
                );
            }
        }));
    }
    return Promise.all(promises);
}

async function convertFiles(currentPath, sources, targetPath, outputFilename, type, sizes, textIteration, options) {
    for (const source of sources) {
        const sourcePath = path.join(currentPath, source);
        if (!fs.existsSync(sourcePath)) {
            console.log(`file "${sourcePath}" does not exist - export config path: ${currentPath}`);
        } else if (textIteration != null) {
            await convertWithTextIteration(sourcePath, targetPath, type, sizes, textIteration, options);
        } else if (type === "svg") {
            await convertToSVG(sourcePath, targetPath, outputFilename, options);
        } else {
            await convertFile(sourcePath, targetPath, outputFilename, type, sizes, options);
        }
    }
}

async function convertWithTextIteration(sourcePath, targetPath, type, sizes, textIteration, options) {
    const {
        token,
        texts
    } = textIteration;
    if (typeof token === "string" && Array.isArray(texts)) {
        const tokenRegExp = new RegExp(token, "g");
        const sourceStat = fs.lstatSync(sourcePath);
        const srcMTime = sourceStat.mtime.valueOf();
        const content = fs.readFileSync(sourcePath).toString();
        for (const text of texts) {
            const basename = path.basename(sourcePath, ".svg");
            const targetFileName = `${basename}.${text}.${type}`;
            const targetFilePath = path.join(targetPath, targetFileName);

            if (fs.existsSync(targetFilePath)) {
                const targetStat = fs.lstatSync(targetFilePath);
                const targetMTime = targetStat.mtime.valueOf();
                if (srcMTime < targetMTime) {
                    if (!CONFIG.silenceIgnored) {
                        const logCommands = JSON.stringify(options ?? {});
                        console.log(`ignore file (not newer): "${sourcePath}" [svg] ${logCommands} -> "${targetFilePath}"`);
                    }
                    continue;
                }
            }

            const newContent = content.replace(tokenRegExp, text);

            const tmpPath = path.join(targetPath, `${basename}.${text}.${type}.tmp`);
            fs.writeFileSync(tmpPath, newContent);

            if (type === "svg") {
                await convertToSVG(tmpPath, targetPath, targetFileName, options);
            } else {
                await convertFile(tmpPath, targetPath, targetFileName, type, sizes, options);
            }

            fs.unlinkSync(tmpPath);
        }
    }
}

async function exportFiles(config, currentPath) {
    const {
        sourceFiles = [],
        targetFolder = CONFIG.targetFolder,
        outputFilename = CONFIG.outputFilename,
        outputFileType = CONFIG.outputFileType,
        outputSizes = [],
        options = {},
        textIteration
    } = config;
    const convertSources = [];
    const targetPath = path.join(currentPath, targetFolder);
    createTargetFolder(targetPath);
    if (!Array.isArray(sourceFiles)) {
        if (typeof sourceFiles !== "string") {
            console.error(`error converting file: "${sourceFiles}" is no valid filename - export config path: ${currentPath}`);
            return;
        }
        if (sourceFiles === "*") {
            const files = fs.readdirSync(currentPath);
            for (const file of files) {
                const nextPath = path.join(currentPath, file);
                if (fs.lstatSync(nextPath).isFile() && nextPath.endsWith(".svg")) {
                    convertSources.push(file);
                }
            }
        } else {
            const nextPath = path.join(currentPath, sourceFiles);
            if (fs.existsSync(nextPath)) {
                if (fs.lstatSync(nextPath).isFile() && nextPath.endsWith(".svg")) {
                    convertSources.push(sourceFiles);
                } else {
                    console.error(`error converting file: "${nextPath}" is no valid svg file - export config path: ${currentPath}`);
                    return;
                }
            } else {
                console.error(`error converting file: "${nextPath}" does not exist - export config path: ${currentPath}`);
                return;
            }
        }
    } else {
        for (const file of sourceFiles) {
            if (typeof file !== "string") {
                console.error(`error converting file: "${sourceFiles}" is no valid filename - export config path: ${currentPath}`);
                continue;
            }
            const nextPath = path.join(currentPath, file);
            if (fs.existsSync(nextPath)) {
                if (fs.lstatSync(nextPath).isFile() && nextPath.endsWith(".svg")) {
                    convertSources.push(file);
                } else {
                    console.error(`error converting file: "${nextPath}" is no valid svg file - export config path: ${currentPath}`);
                    continue;
                }
            } else {
                console.error(`error converting file: "${nextPath}" does not exist - export config path: ${currentPath}`);
                continue;
            }
        }
    }
    await convertFiles(currentPath, convertSources, targetPath, outputFilename, outputFileType, outputSizes, textIteration, options);
}

async function executeExport(configPath, currentPath) {
    const exportConfig = JSON.parse(fs.readFileSync(configPath).toString());
    if (Array.isArray(exportConfig)) {
        for (const config of exportConfig) {
            await exportFiles(config, currentPath);
        }
    } else {
        await exportFiles(exportConfig, currentPath);
    }
}

// search for export configurations
async function searchFolderRecursive(currentPath) {
    if (fs.lstatSync(currentPath).isDirectory()) {
        const files = fs.readdirSync(currentPath);
        for (const file of files) {
            const nextPath = path.join(currentPath, file);
            if (fs.lstatSync(nextPath).isDirectory()) {
                searchFolderRecursive(nextPath);
            } else if (file === ".export.json") {
                await executeExport(nextPath, currentPath);
            }
        }
    }
}

await searchFolderRecursive(CONFIG.sourceFolder);
