import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*');

    if (request.method !== 'GET') {
        return response.status(405).json({ message: 'Method unsupported except GET.' });
    }

    try {
        await client.connect();

        const db = client.db('YQBBQMain');
        var messages = db.collection('Messages');

        const res = await messages
            .find({})
            .sort({ time: -1 })
            .limit(50)
            .toArray();
        
        response.status(200).json(res);
    } catch (error) {
        return response.status(500).json({ message: "Server internal error.", error: error.message });
    } finally {
        await client.close();
    }
}