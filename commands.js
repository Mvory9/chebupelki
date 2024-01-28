// Импорт важного
import fs from "fs";
const cfg = JSON.parse(fs.readFileSync("./cfg.json", "utf8"));

// Импорт команд
import Reg from "./commands/reg.js";

// Переменная
const CMD = {
    reg: async (id) => { const result = await Reg(id); return result; },
}

// Экспорт
export default CMD;