# fabric-common

This is branch for v1.1.0

# Installation
- init submodule  
    `./install gitSync`

# build v1.1.0
see [Build 1.1](./BUILD1.1.md)

# Notes: moving from 1.2 to 1.1
- eventHub
    - Use traditional eventHub js object instead of channelEventHub
    - npm grpc should strictly point to 1.10.1
    - expose port 7053 from peer container
- `Capabilities` section in configtx.yaml
- fabric image tag system
    - core images: `${arch}-${tag}` instead of `${tag}`
    - use `0.4.6` as third party tag
             