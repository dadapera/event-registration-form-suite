const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

// CSV parsing and lookup functions
let csvDataCache = null;

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

function loadCSVData(instancePath) {
    if (csvDataCache) return csvDataCache; // Return cached data if already loaded
    
    try {
        const csvPath = path.join(instancePath, 'sample_data_with_ids.csv');
        
        if (!fs.existsSync(csvPath)) {
            log('ERROR', `CSV file not found at: ${csvPath}`);
            return null;
        }
        
        const csvText = fs.readFileSync(csvPath, 'utf8');
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) {
            log('ERROR', 'CSV file appears to be empty or has no data rows');
            return null;
        }
        
        const headers = parseCSVLine(lines[0]);
        log('DEBUG', `CSV headers found: ${headers.join(', ')}`);
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) { // Skip empty lines
                const values = parseCSVLine(lines[i]);
                const row = {};
                headers.forEach((header, index) => {
                    row[header.trim()] = values[index] ? values[index].trim() : '';
                });
                data.push(row);
            }
        }
        
        csvDataCache = data; // Cache the data
        log('INFO', `CSV data loaded successfully: ${data.length} rows`);
        return data;
    } catch (error) {
        log('ERROR', `Error loading CSV data: ${error.message}`);
        return null;
    }
}

function lookupUserData(userId, instancePath) {
    const data = loadCSVData(instancePath);
    if (!data) return null;
    
    const user = data.find(row => row['USER_ID'] === userId);
    if (user) {
        return {
            schedaNumero: user['SCHEDA NUMERO'],
            codiceCliente: user['CODICE CLIENTE'],
            email: user['EMAIL'],
            userId: user['USER_ID']
        };
    }
    return null;
}

module.exports = {
    parseCSVLine,
    loadCSVData,
    lookupUserData
};
