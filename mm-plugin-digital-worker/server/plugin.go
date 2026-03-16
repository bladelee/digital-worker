package main

import (
	"sync"

	"github.com/mattermost/mattermost/server/public/plugin"
)

type DigitalWorkerPlugin struct {
	plugin.MattermostPlugin
	configurationLock sync.RWMutex
	configuration     *configuration
}

func (p *DigitalWorkerPlugin) OnActivate() error {
	p.API.LogInfo("数字员工插件已激活")
	return nil
}

func (p *DigitalWorkerPlugin) OnDeactivate() error {
	p.API.LogInfo("数字员工插件已停用")
	return nil
}

type configuration struct {
	PlatformAPIUrl string
}

func (p *DigitalWorkerPlugin) getConfiguration() *configuration {
	p.configurationLock.RLock()
	defer p.configurationLock.RUnlock()
	if p.configuration == nil {
		return &configuration{}
	}
	return p.configuration
}
