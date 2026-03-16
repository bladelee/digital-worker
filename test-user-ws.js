const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:8065/api/v4/websocket');
const token = 'pbdu3bb87frtug96fiwoaek1rr'; // 普通用户 token

ws.on('open', () => {
    console.log('[连接成功] 测试普通用户是否能收到群聊消息...');
    
    ws.send(JSON.stringify({
        seq: 1,
        action: "authentication_challenge",
        data: { token: token }
    }));
    
    setTimeout(() => {
        console.log('\n30秒超时退出');
        ws.close();
        process.exit(0);
    }, 30000);
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        const time = new Date().toLocaleTimeString();
        const event = msg.event || 'unknown';
        
        if (event === 'posted') {
            const post = msg.data?.post ? JSON.parse(msg.data.post) : {};
            console.log(`[${time}] posted: "${post.message?.substring(0,40)}" in ${msg.broadcast?.channel_id?.substring(0,10)}`);
        } else if (event.startsWith('custom_')) {
            console.log(`[${time}] ★ CUSTOM: ${event.substring(0,50)}...`);
        } else {
            console.log(`[${time}] ${event}`);
        }
    } catch(e) {}
});

ws.on('error', e => console.error('Error:', e.message));
