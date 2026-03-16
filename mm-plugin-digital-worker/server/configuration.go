package main

import (
)

// OnConfigurationChange handles configuration changes
func (p *DigitalWorkerPlugin) OnConfigurationChange() error {
	var cfg configuration
	if err := p.API.LoadPluginConfiguration(&cfg); err != nil {
		return err
	}
	p.configurationLock.Lock()
	p.configuration = &cfg
	p.configurationLock.Unlock()
	return nil
}
