import { MongoClient } from 'mongodb';
import fs from 'fs';

const cfg = JSON.parse(fs.readFileSync("././cfg.json", "utf8"));

const client = new MongoClient(cfg.mongoIp);
const users = client.db(cfg.name.toLowerCase()).collection(`users`);

const Reg = async (id) => {
    try {
        await client.connect();
        let data = await users.findOne({ id: id });

        if (id < 0) return;

        if (!data) {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0'); // Январь - нулевой месяц!
            const year = today.getFullYear();
            const hours = String(today.getHours()).padStart(2, '0');
            const minutes = String(today.getMinutes()).padStart(2, '0');
            const seconds = String(today.getSeconds()).padStart(2, '0');
            
            const formattedDate = `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
            
            data = {
              id: id,
              balance: 0,
              likes: 0,
              access: false,
              subscriber: false,
              regdate: formattedDate,
              lastGetBonus: 0
            };

            await users.insertOne(data);
        }
    } catch (err) {
        console.log(err);
    } finally {
        await client.close();
    }
}

export default Reg;