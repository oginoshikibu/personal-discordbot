import { PrismaClient } from "@prisma/client";
import type { Message } from "discord.js";


export const registarArticleByMessage = async (message: Message): Promise<void> => {

    // 正しいURLかどうかをURLクラスを使って判定
    const parsedMessageURL = (() => {
        try {
            return new URL(message.content);
        }
        catch (error) {
            message.reply('Invalid URL');
            console.error(error);
            return null;
        }
    })();
    if (!parsedMessageURL) return;

    // URLからタイトルを取得
    const fetchWithTimeout = async (url: string, timeout: number): Promise<Response> => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
    };

    const articleTitle = await (async () => {
        console.log(`Fetching title from ${parsedMessageURL.href}`);
        try {
            const response = await fetchWithTimeout(parsedMessageURL.href, 5000); // 5 seconds timeout
            const html = await response.text();
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            const title = titleMatch ? titleMatch[1] : 'No title found';
            console.log(`Fetched title: ${title}`);
            return title;
        } catch (error: any) {
            console.error(`Failed to fetch title: ${error.message}`);
            return 'No title found';
        }
    })();

    // データベースに登録
    const prismaClient = new PrismaClient();
    const Article = await (async () => {
        try {
            return await prismaClient.article.create({
                data: {
                    url: parsedMessageURL.href,
                    title: articleTitle,
                },
            });
        } catch (error: any) {
            message.reply(`Failed to register article: ${error.message}`);
            return null;
        }
    })();
    if (!Article) return;

    await message.react('👍');  //  成功時
    await prismaClient.$disconnect();
}