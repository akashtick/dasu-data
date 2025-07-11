const fs = require('fs-extra');
const Papa = require('papaparse');
const path = require('path');

function getFolderName() {
    if (process.argv[2]) return process.argv[2];
    if (process.env.npm_config_argv) {
        try {
            const npmArgv = JSON.parse(process.env.npm_config_argv);
            if (npmArgv.original.length > 1) {
                return npmArgv.original[1];
            }
        } catch {
            // ignore parse errors
        }
    }
    return null;
}

function ensureFolderProvided(folderName) {
    if (!folderName) {
        console.error('❌ Missing output folder name argument');
        process.exit(1);
    }
    return folderName;
}

function setupDirectories(folderName) {
    const importDir = path.join(__dirname, 'input', folderName);
    const outputBaseDir = path.join(__dirname, 'output');
    const exportDir = path.join(outputBaseDir, folderName);
    fs.ensureDirSync(exportDir);
    return { importDir, exportDir };
}

function convertValue(value) {
    if (value === '') return null;
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    return isNaN(value) ? value : parseFloat(value);
}

function handleDotNotation(row) {
    return Object.keys(row).reduce((newRow, key) => {
        const value = row[key];
        key.split('.').reduce((acc, part, idx, arr) => {
            if (idx === arr.length - 1) acc[part] = value;
            else acc[part] = acc[part] || {};
            return acc[part];
        }, newRow);
        return newRow;
    }, {});
}

function processRow(row, headers) {
    Object.keys(row).forEach(key => row[key] = convertValue(row[key]));
    row = handleDotNotation(row);
    const defaultAptitudes = {
        f: 0, i: 0, el: 0, w: 0, ea: 0, l: 0, d: 0,
        dp: 0, dm: 0, da: 0, h: 0, tb: 0, tt: 0,
        tg: 0, ta: 0, assist: 0
    };

    if (headers.includes("tags")) {
        if (row.hasOwnProperty("tags") && Array.isArray(row.tags)) {
            row.tags = row.tags.filter(tag => tag && typeof tag.id === 'string');
        } else {
            row.tags = [];
        }
    }

    if (row.hasOwnProperty("aptitudes")) {
        let aptitudeData = {};
        if (row.aptitudes === null || row.aptitudes === '') {
            aptitudeData = {};
        } else if (typeof row.aptitudes === 'string' && row.aptitudes.includes('-')) {
            const [aptKey, aptValue] = row.aptitudes.split('-');
            aptitudeData[aptKey.toLowerCase()] = parseInt(aptValue, 10);
        }
        row.aptitudes = { ...defaultAptitudes, ...aptitudeData };
    }

    if ('damage' in row || 'type' in row) {
        const value = parseInt(row.damage, 10);
        const type = row.type || 'unknown';
        row.damage = {
            value: isNaN(value) ? 0 : value,
            type: type
        };
        delete row.type;
    }

    if (!row.description) row.description = "";
    return row;
}

function convertCsvToJson(importDir, exportDir, folderName) {
    fs.readdir(importDir, (err, files) => {
        if (err) {
            console.error(`❌ Error reading directory: ${err.message}`);
            return;
        }

        const csvFiles = files.filter(file => file.endsWith('.csv') && file !== 'daemons.csv');
        if (csvFiles.length === 0) {
            console.log(`⚠️ No CSV files found in ${importDir}`);
            return;
        }

        csvFiles.forEach(file => {
            const csvFilePath = path.join(importDir, file);
            const jsonFilePath = path.join(exportDir, file.replace('.csv', '.json'));

            fs.readFile(csvFilePath, 'utf8', (err, data) => {
                if (err) {
                    console.error(`❌ Error reading file ${file}: ${err.message}`);
                    return;
                }

                Papa.parse(data, {
                    header: true,
                    skipEmptyLines: true,
                    complete: result => {
                        const headers = result.meta.fields || [];
                        const processedData = result.data.map(row => processRow(row, headers));
                        fs.writeJson(jsonFilePath, processedData, { spaces: 2 }, err => {
                            if (err) {
                                console.error(`❌ Error writing JSON for ${file}: ${err.message}`);
                                return;
                            }
                            console.log(`✅ Successfully converted ${file} to JSON in folder ${folderName}`);
                        });
                    },
                    error: error => console.error(`❌ Error parsing CSV file ${file}: ${error.message}`)
                });
            });
        });
    });
}

const folderName = ensureFolderProvided(getFolderName());
const { importDir, exportDir } = setupDirectories(folderName);
convertCsvToJson(importDir, exportDir, folderName);
