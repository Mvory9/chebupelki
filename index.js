// Импорты
import { MongoClient } from "mongodb";
import { Keyboard, VK } from "vk-io";
import random from "random";
import fs from 'fs';
import cron from 'node-cron';

// Конфиг
const cfg = JSON.parse(fs.readFileSync('./cfg.json', 'utf8'));

// МонгоДБ
const client = new MongoClient(cfg.mongoIp);
const users = client.db(cfg.name.toLowerCase()).collection(`users`);
const posts = client.db(cfg.name.toLowerCase()).collection(`posts`);
const convs = client.db(cfg.name.toLowerCase()).collection(`convs`);

// Команды
import CMD from "./commands.js";

// Токен
const vk = new VK({
    token: cfg.token
})

// Ивенты
vk.updates.on('message_new', async (context) => {
    if (context.isOutbox || context.isGroup || !context.text) return;

    // Сокращения
    const { text, peerId, senderId, isChat } = context;
    const cmd = context.text.toLowerCase();

    // Сообщения в беседе
    if (isChat) {
        // Бонус за сообщение
        try {
            await client.connect();
            await users.updateOne({ id: senderId }, { $inc: { balance: 5 } });
        } catch (err) { console.log(err); } finally { await client.close(); }

        if (cmd.startsWith('ответ ') || cmd.startsWith('jndtn ')) {
            try {
                const cmdd = cmd.slice(6);
                await client.connect();
                const conv = await convs.findOne({ id: peerId });
                const vkUser = await vk.api.users.get({ user_ids: senderId });
                const { first_name, last_name } = vkUser[0];

                if (cmdd == conv.quiz.answer) {
                    await context.send(`⚠ В викторине побеждает [id${senderId}|${first_name} ${last_name}]\n\n👑 Правильный ответ - ${conv.quiz.answer}\n\n💰 Награда победителю - 0.${conv.quiz.prize} рублей.`)
                    await convs.updateOne({ id: peerId }, { $set: { "quiz.answer": null, "quiz.value": null, "quiz.prize": 0 } });
                    await users.updateOne({ id: senderId }, { $inc: { balance: conv.quiz.prize } });

                    await vk.api.messages.send({
                        random_id: random.int(0, 999999),
                        message: `🕰 Следующая викторина начнётся через 2 часа`,
                        peer_id: peerId
                    }).catch(err => {});
                } else if (!conv.quiz.value) {
                    await context.reply(`На данный момент викторина не проходит!`);
                } else {
                    await context.reply(`Неправильно!`);
                }

            } catch (err) { console.log(err); } finally { await client.close(); }
        }

    // Сообщения в ЛС
    } else {
        if (cmd === `начать` || cmd === `меню`) {
            await context.send(`Меню:`, {
                keyboard: Keyboard.builder()
                    .textButton({ label: `🎁 Бонус`, color: Keyboard.POSITIVE_COLOR })
                    .row()
                    .textButton({ label: `💼 Профиль`, color: Keyboard.PRIMARY_COLOR })
                    .textButton({ label: `💸 Вывести`, color: Keyboard.POSITIVE_COLOR })
            })
        }

        else if (cmd === `🎁 бонус`) {
            try {
                await client.connect();
                const user = await users.findOne({ id: senderId });
                const timestamp = Math.floor(Date.now() / 1000);

                const bonus = random.int(10, 50)
                if (timestamp - user.lastGetBonus >= 86400) {
                    await context.send(`✅ Вы получили бонус +${bonus/100}₽\n💰Ваш баланс ${(user.balance+bonus)/100}₽`);
                    await users.updateOne({ id: senderId }, { $set: { lastGetBonus: timestamp }, $inc: { balance: bonus } });
                } else {
                    await context.send(`⛔ Бонус будет доступен через ${Math.floor((86400 - (timestamp - user.lastGetBonus))/3600)}:${Math.floor((86400 - (timestamp - user.lastGetBonus))/60)%60}:${Math.floor((86400 - (timestamp - user.lastGetBonus))%60)}`);
                }
            } catch (err) { console.log(err); } finally { await client.close(); }
        }
        
        else if (cmd === `💼 профиль`) {
            try {
                await client.connect();
                const user = await users.findOne({ id: senderId });
                const vkUser = await vk.api.users.get({ user_ids: user.id })

                await context.send(`${vkUser[0].first_name}, Ваш профиль:\n\n🆔 Айди: ${senderId}\n💰 Баланс: ${user.balance}₽\n❤ Лайков: ${user.likes}\n\n❗ Статус обмена: ${user.access ? `Включён ✅` : `Отключён ⛔`} `);
            } catch (err) { console.log(err); } finally { await client.close(); }
        }
        
        else if (cmd === `💸 вывести`) {
            try {
                await client.connect();
                // const user = await users.findOne({ id: senderId });

                await context.send(`Пока не готово...`);
            } catch (err) { console.log(err); } finally { await client.close(); }
        }
    }
});

vk.updates.on('group_join', async (context) => {
    await CMD.reg(context.userId);

    await vk.api.messages.send({
        random_id: random.int(0, 999999),
        message: `🎁 Бонус за подписку +1.00₽!`,
        user_id: context.userId
    }).catch(err => {});

    try {
        await client.connect();
        const user = await users.findOne({ id: context.userId });
        if (user.subscriber) return;
        await users.updateOne({ id: context.userId }, { $set: { subscriber: true }, $inc: { balance: 100 } });
    } catch (err) { console.log(err); } finally { await client.close(); }
})

vk.updates.on('group_leave', async (context) => {
    await CMD.reg(context.userId);
    await vk.api.messages.send({
        random_id: random.int(0, 999999),
        message: `💔 Жаль, что вы нас покинули`,
        user_id: context.userId
    }).catch(err => {});

})

vk.updates.on('wall_reply_new', async (context) => {
    await CMD.reg(context.fromId);

    try {
        await client.connect();
        const post = await posts.findOne({ id: context.objectId });

        if (!post) {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0'); // Январь - нулевой месяц!
            const year = today.getFullYear();
            const hours = String(today.getHours()).padStart(2, '0');
            const minutes = String(today.getMinutes()).padStart(2, '0');
            const seconds = String(today.getSeconds()).padStart(2, '0');
            
            const formattedDate = `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;

            const data = {
                id: context.objectId,
                user: context.fromId,
                date: formattedDate
            };
  
            await posts.insertOne(data);

            const randomBonus = random.int(10, 50);
            await users.updateOne({ id: context.fromId }, { $inc: { balance: randomBonus } });

            await vk.api.wall.createComment({
                owner_id: context.ownerId,
                post_id: context.objectId,
                message: `[[id${context.fromId}|✅]] Награда ${randomBonus/100}₽ за первый комментарий`,
                reply_to_comment: context.id
            }).catch(err => {});
        }
    } catch (err) { console.log(err); } finally { await client.close(); }
})

vk.updates.on('like_add', async (context) => {
    await CMD.reg(context.likerId);
    try {
        await client.connect();
        await users.updateOne({ id: context.fromId }, { $inc: { balance: 10 } });

        await vk.api.messages.send({
            random_id: random.int(0, 999999),
            message: `❤ Награда за лайк на пост +0.10₽`,
            user_id: context.likerId
        }).catch(err => {});

    } catch (err) { console.log(err); } finally { await client.close(); }
})

vk.updates.on('like_remove', async (context) => {
    await CMD.reg(context.likerId);
    try {
        await client.connect();
        await users.updateOne({ id: context.fromId }, { $inc: { balance: -15 } });

        await vk.api.messages.send({
            random_id: random.int(0, 999999),
            message: `💔 Штраф за удаление лайка с поста -0.15₽`,
            user_id: context.likerId
        }).catch(err => {});

    } catch (err) { console.log(err); } finally { await client.close(); }
})

// Запускатор
vk.updates.start().then(() => {
    console.log(`[✅] Бот успешно запущен.`)
}).catch((err) => {
    console.log(`[❌] Бот не запущен. Ошибка: ${err}`)
})

// << ----------------------------------------------------------------------------------------------------- >>
// Запускатор викторины
async function quiz(peerId) {
    const primerRandom = random.int(1, 3);
    const numberBonus = random.int(10, 50);
    let first_number;
    let symbol;
    let second_number;

    switch (primerRandom) {
        case 1: {
            first_number = random.int(0, 255);
            symbol = `+`;
            second_number = random.int(0, 255);
            break;
        }
        case 2: {
            first_number = random.int(100, 255);
            symbol = `-`;
            second_number = random.int(0, 99);
            break;
        }
        case 3: {
            first_number = random.int(1, 15);
            symbol = `*`;
            second_number = random.int(1, 15);
            break;
        }
    }

    const primer = `${first_number} ${symbol} ${second_number}`;
    const answer = eval(primer);

    await vk.api.messages.send({
        random_id: random.int(0, 999999),
        message: `⚠ МАТИМАТИЧЕСКАЯ ВИКТОРИНА!\n${first_number} ${symbol} ${second_number} = ?\n\nПервый, кто даст правильный ответ - получит 0.${numberBonus} рублей.\n\nФорма для ответа: Ответ [ответ]\n\n💠 Про викторины: Викторины проводятся каждые два часа без перерывов. Приз составляет 0.10-0.50 рублей.`,
        peer_id: peerId
    }).catch(err => {})

    try {
        await client.connect();

        const conv = await convs.findOne({ id: peerId });
        if (!conv) {
            const data = {
                id: peerId,
                quiz: {
                    answer: null,
                    value: null,
                    prize: 0
                }
            };
            await convs.insertOne(data);
        }

        setTimeout(async () => {
            await client.connect();

            await vk.api.messages.send({
                random_id: random.int(0, 999999),
                message: `⛔ Никто не дал правильный ответ за 20 секунд...\n\n👑 Ответ: ${answer}`,
                peer_id: peerId
            }).catch(err => {});
            
            await convs.updateOne({ id: peerId }, { $set: { "quiz.answer": null, "quiz.value": null, "quiz.prize": 0 } });

            await vk.api.messages.send({
                random_id: random.int(0, 999999),
                message: `🕰 Следующая викторина начнётся через 2 часа`,
                peer_id: peerId
            }).catch(err => {});
        }, 20 * 1000);

        await convs.updateOne({ id: peerId }, { $set: { "quiz.answer": answer, "quiz.value": primer, "quiz.prize": numberBonus } });
    } catch (err) { console.log(err); } finally { await client.close(); }
}
  
cron.schedule('0 0 0,2,4,6,8,10,12,14,16,18,20,22 * * *', async () => {
    await quiz(cfg.peers.game);
});