//
// test.js
//
// Rue Programming Language
// created by Aaron Meche
//

import fs from 'fs';
import path from 'path';
import { RueFile } from "rue-lang"

function writeFileText(filePath, fileContent) {
    const dir = path.dirname(filePath)
    if (dir && dir != ".") fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, fileContent)
}

let file = new RueFile("./src/main.rue")
writeFileText("index.html", file.getHTML())
