//
// helpers.ts
//
// Rue Programming Language
// created by Aaron Meche
//

import fs from 'fs';
import path from 'path';

// Read File Text Content
export function readFileText(filePath: string): string { 
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content;
    } catch (error) {
        let message = error instanceof Error ? error.message : String(error)
        console.error("read file: " + message)
        return ""
    }
}

// Write File Text Content
export function writeFileText(filePath: string, fileContent: string): void {
    const dir = path.dirname(filePath)
    if (dir && dir != ".") fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, fileContent)
}