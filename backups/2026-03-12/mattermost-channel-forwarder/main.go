package main

import (
	"sync"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

// BotChannelForwarderPlugin forwards channel messages to bot users via WebSocket
type BotChannelForwarderPlugin struct {
	plugin.MattermostPlugin

	// configuration mutex
	configLock sync.RWMutex
}

// OnActivate is called when the plugin is activated
func (p *BotChannelForwarderPlugin) OnActivate() error {
	p.API.LogInfo("Bot Channel Forwarder plugin activated", "version", "1.0.0")
	return nil
}

// OnDeactivate is called when the plugin is deactivated
func (p *BotChannelForwarderPlugin) OnDeactivate() error {
	p.API.LogInfo("Bot Channel Forwarder plugin deactivated")
	return nil
}

// MessageHasBeenPosted is called after a message has been posted
func (p *BotChannelForwarderPlugin) MessageHasBeenPosted(c *plugin.Context, post *model.Post) {
	// Process asynchronously to not block the post
	go p.processPost(post)
}

func (p *BotChannelForwarderPlugin) processPost(post *model.Post) {
	// Skip deleted posts
	if post.DeleteAt > 0 {
		p.API.LogInfo("BotChannelForwarder: skipping deleted post", "post_id", post.Id)
		return
	}

	// Get channel info
	channel, appErr := p.API.GetChannel(post.ChannelId)
	if appErr != nil {
		p.API.LogError("BotChannelForwarder: failed to get channel", "channel_id", post.ChannelId, "error", appErr.Error())
		return
	}

	// Safely truncate message preview
	msgPreview := post.Message
	if len(msgPreview) > 50 {
		msgPreview = msgPreview[:50]
	}

	p.API.LogInfo("BotChannelForwarder: processing post",
		"post_id", post.Id,
		"channel_id", post.ChannelId,
		"channel_type", string(channel.Type),
		"message_preview", msgPreview)

	// Only process public/private channels (not DMs or Group DMs by default)
	// MVP: hard-coded, can be configured later
	if channel.Type != model.ChannelTypeOpen && channel.Type != model.ChannelTypePrivate {
		p.API.LogInfo("BotChannelForwarder: skipping non-channel message", "channel_type", string(channel.Type))
		return
	}

	// Skip bot messages to prevent loops
	user, appErr := p.API.GetUser(post.UserId)
	if appErr != nil {
		p.API.LogError("BotChannelForwarder: failed to get user", "user_id", post.UserId, "error", appErr.Error())
		return
	}
	if user.IsBot {
		p.API.LogInfo("BotChannelForwarder: skipping bot message", "user_id", post.UserId)
		return
	}

	// Get channel members
	members, appErr := p.API.GetChannelMembers(post.ChannelId, 0, 100)
	if appErr != nil {
		p.API.LogError("BotChannelForwarder: failed to get channel members", "channel_id", post.ChannelId, "error", appErr.Error())
		return
	}

	p.API.LogInfo("BotChannelForwarder: checking members", "member_count", len(members))

	// Forward to each bot in the channel
	forwardCount := 0
	for _, member := range members {
		memberUser, appErr := p.API.GetUser(member.UserId)
		if appErr != nil {
			p.API.LogError("BotChannelForwarder: failed to get member user", "user_id", member.UserId, "error", appErr.Error())
			continue
		}

		// Log each member's bot status for debugging
		p.API.LogInfo("BotChannelForwarder: checking member", 
			"user_id", member.UserId, 
			"username", memberUser.Username,
			"is_bot", memberUser.IsBot)

		// Only forward to bot users
		if !memberUser.IsBot {
			continue
		}

		p.forwardToBot(post, memberUser.Id)
		forwardCount++
	}

	p.API.LogInfo("BotChannelForwarder: forwarded to bots", "count", forwardCount)
}

func (p *BotChannelForwarderPlugin) forwardToBot(post *model.Post, botUserId string) {
	// Build event data with ONLY basic types to avoid gob serialization issues
	// Use minimal fields to prevent panic
	eventData := map[string]interface{}{
		"post_id":       post.Id,
		"channel_id":    post.ChannelId,
		"user_id":       post.UserId,
		"message":       post.Message,
		"target_bot_id": botUserId,
	}

	// 使用 ChannelId 广播，而不是 nil
	// nil 可能导致 Mattermost 内部 panic
	broadcast := &model.WebsocketBroadcast{
		ChannelId: post.ChannelId,
	}

	p.API.PublishWebSocketEvent(
		"bot_channel_message",
		eventData,
		broadcast,
	)

	p.API.LogInfo("BotChannelForwarder: broadcasted message",
		"post_id", post.Id,
		"channel_id", post.ChannelId,
		"target_bot_id", botUserId,
	)
}

func main() {
	plugin.ClientMain(&BotChannelForwarderPlugin{})
}
