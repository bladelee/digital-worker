const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:8065/api/v4/websocket');
const token = 'pbdu3bb87frtug96fiwoaek1rr';

ws.on('open', () => {
    console.log('[连接成功] 监听所有事件 (45秒超时)');
    
    ws.send(JSON.stringify({
        seq: 1,
        action: "authentication_challenge",
        data: { token: token }
    }));
    
    setTimeout(() => {
        console.log('\n超时退出');
        ws.close();
        process.exit(0);
    }, 45000);
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        const time = new Date().toLocaleTimeString();
        const event = msg.event || 'unknown';
        
        if (event === 'posted') {
            const post = msg.data?.post ? JSON.parse(msg.data.post) : {};
            console.log(`[${time}] posted: "${post.message?.substring(0,40)}"`);
        } else if (event.startsWith('custom_')) {
            console.log(`\n[${time}] ★★★ CUSTOM EVENT: ${event}`);
            console.log('Full message:', JSON.stringify(msg, null, 2));
        } else {
            console.log(`[${time}] ${event}`);
        }
    } catch(e) {
        console.log('Parse error');
    }
});

ws.on('error', e => console.error('Error:', e.message));
