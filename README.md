# Matterbridge EcoFlow DELTA Pro Ultra

[![npm](https://badgen.net/npm/v/matterbridge-ecoflow-delta-pro-ultra)](https://www.npmjs.com/package/matterbridge-ecoflow-delta-pro-ultra)
[![node](https://badgen.net/npm/node/matterbridge-ecoflow-delta-pro-ultra)](https://www.npmjs.com/package/matterbridge-ecoflow-delta-pro-ultra)
[![downloads](https://badgen.net/npm/dt/matterbridge-ecoflow-delta-pro-ultra)](https://www.npmjs.com/package/matterbridge-ecoflow-delta-pro-ultra)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/michaelahern/matterbridge-ecoflow-delta-pro-ultra)

A [Matterbridge](https://github.com/Luligu/matterbridge) plugin for [EcoFlow DELTA Pro Ultra](https://www.ecoflow.com/delta-pro-ultra) devices via the [EcoFlow Developer Platform](https://developer.ecoflow.com/).

## Requirements

 * [Matterbridge](https://github.com/Luligu/matterbridge)
 * An [EcoFlow DELTA Pro Ultra](https://www.ecoflow.com/delta-pro-ultra) device
 * An [EcoFlow Developer Platform](https://developer.ecoflow.com/) account

## Configuration

Field                | Description
---------------------|------------
**accessKey**        | (required) Access Key generated in the [EcoFlow Developer Platform](https://developer.ecoflow.com/)
**secretKey**        | (required) Secret Key generated in the [EcoFlow Developer Platform](https://developer.ecoflow.com/)
**debug**            | (optional) Enable debug logging, disabled by default

## Matter Ecosystems

This plugin attempts to implement a Battery Storage device type for the EcoFlow DELTA Pro Ultra as defined in [Matter 1.4](https://csa-iot.org/newsroom/matter-1-4-enables-more-capable-smart-homes/). However, this device type is not yet supported in most smart home ecosystems and only a subset of functionality will be available.

### Apple Home

Supported Functionality: AC & DC On/Off Switches, Battery Status

### Amazon Alexa

TBD

### Home Assistant

TBD
