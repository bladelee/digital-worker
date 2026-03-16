.PHONY: all build dist clean

PLUGIN_ID := com.openclaw.bot-channel-forwarder
PLUGIN_VERSION := 1.0.0
GO ?= go
GOOS ?= linux
GOARCH ?= amd64

BUILD_DIR := server/dist
PLUGIN_DIR := $(BUILD_DIR)/$(PLUGIN_ID)

all: dist

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(PLUGIN_DIR): $(BUILD_DIR)
	mkdir -p $(PLUGIN_DIR)

build: $(PLUGIN_DIR)
	cd $(BUILD_DIR)/.. && \
	GOOS=$(GOOS) GOARCH=$(GOARCH) CGO_ENABLED=0 \
	$(GO) build -o dist/plugin-$(GOOS)-$(GOARCH) ../main.go

dist: build
	tar -czf $(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz manifest.json server/

clean:
	rm -rf $(BUILD_DIR)
	rm -f $(PLUGIN_ID)-*.tar.gz

# For local development
install: dist
	@echo "Upload $(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz via Mattermost System Console > Plugins"
