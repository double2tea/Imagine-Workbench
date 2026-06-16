import type { ParameterOption } from "../model-catalog";

export interface RunningHubStandardOptionProfile {
  aspectRatios?: readonly ParameterOption[];
  sizes?: readonly ParameterOption[];
  qualityLevels?: readonly ParameterOption[];
  resolutions?: readonly ParameterOption[];
  durations?: readonly ParameterOption[];
  presets?: readonly ParameterOption[];
}

export const RUNNINGHUB_STANDARD_OPTION_PROFILES = {
  "api:/openapi/v2/alibaba/qwen-image-2.0/text-to-image": {
    sizes: [{"value":"1024*1024","label":"1024*1024"},{"value":"1536*1536","label":"1536*1536"},{"value":"768*1152","label":"768*1152"},{"value":"1024*1536","label":"1024*1536"},{"value":"1152*768","label":"1152*768"},{"value":"1536*1024","label":"1536*1024"},{"value":"960*1280","label":"960*1280"},{"value":"1080*1440","label":"1080*1440"},{"value":"1280*960","label":"1280*960"},{"value":"1440*1080","label":"1440*1080"},{"value":"720*1280","label":"720*1280"},{"value":"1080*1920","label":"1080*1920"},{"value":"1280*720","label":"1280*720"},{"value":"1920*1080","label":"1920*1080"},{"value":"1344*576","label":"1344*576"},{"value":"2048*872","label":"2048*872"}],
  },
  "api:/openapi/v2/alibaba/qwen-image-2.0/image-edit": {
    sizes: [{"value":"1024*1024","label":"1024*1024"},{"value":"1536*1536","label":"1536*1536"},{"value":"768*1152","label":"768*1152"},{"value":"1024*1536","label":"1024*1536"},{"value":"1152*768","label":"1152*768"},{"value":"1536*1024","label":"1536*1024"},{"value":"960*1280","label":"960*1280"},{"value":"1080*1440","label":"1080*1440"},{"value":"1280*960","label":"1280*960"},{"value":"1440*1080","label":"1440*1080"},{"value":"720*1280","label":"720*1280"},{"value":"1080*1920","label":"1080*1920"},{"value":"1280*720","label":"1280*720"},{"value":"1920*1080","label":"1920*1080"},{"value":"1344*576","label":"1344*576"},{"value":"2048*872","label":"2048*872"}],
  },
  "api:/openapi/v2/alibaba/qwen-image-2.0-pro/text-to-image": {
    sizes: [{"value":"1024*1024","label":"1024*1024"},{"value":"1536*1536","label":"1536*1536"},{"value":"768*1152","label":"768*1152"},{"value":"1024*1536","label":"1024*1536"},{"value":"1152*768","label":"1152*768"},{"value":"1536*1024","label":"1536*1024"},{"value":"960*1280","label":"960*1280"},{"value":"1080*1440","label":"1080*1440"},{"value":"1280*960","label":"1280*960"},{"value":"1440*1080","label":"1440*1080"},{"value":"720*1280","label":"720*1280"},{"value":"1080*1920","label":"1080*1920"},{"value":"1280*720","label":"1280*720"},{"value":"1920*1080","label":"1920*1080"},{"value":"1344*576","label":"1344*576"},{"value":"2048*872","label":"2048*872"}],
  },
  "api:/openapi/v2/alibaba/qwen-image-2.0-pro/image-edit": {
    sizes: [{"value":"1024*1024","label":"1024*1024"},{"value":"1536*1536","label":"1536*1536"},{"value":"768*1152","label":"768*1152"},{"value":"1024*1536","label":"1024*1536"},{"value":"1152*768","label":"1152*768"},{"value":"1536*1024","label":"1536*1024"},{"value":"960*1280","label":"960*1280"},{"value":"1080*1440","label":"1080*1440"},{"value":"1280*960","label":"1280*960"},{"value":"1440*1080","label":"1440*1080"},{"value":"720*1280","label":"720*1280"},{"value":"1080*1920","label":"1080*1920"},{"value":"1280*720","label":"1280*720"},{"value":"1920*1080","label":"1920*1080"},{"value":"1344*576","label":"1344*576"},{"value":"2048*872","label":"2048*872"}],
  },
  "api:/openapi/v2/alibaba/wan-2.7/text-to-image": {
    sizes: [{"value":"1024x1024","label":"1K"},{"value":"1536x1024","label":"1K"},{"value":"1024x1536","label":"1K"},{"value":"1536x1536","label":"1K"},{"value":"2048x2048","label":"2K"}],
  },
  "api:/openapi/v2/alibaba/wan-2.7/image-edit": {
    sizes: [{"value":"1024x1024","label":"1K"},{"value":"1536x1024","label":"1K"},{"value":"1024x1536","label":"1K"},{"value":"1536x1536","label":"1K"},{"value":"2048x2048","label":"2K"}],
  },
  "api:/openapi/v2/alibaba/wan-2.7/text-to-image-pro": {
    sizes: [{"value":"1024x1024","label":"1K"},{"value":"1536x1024","label":"1K"},{"value":"1024x1536","label":"1K"},{"value":"1536x1536","label":"1K"},{"value":"2048x2048","label":"2K"}],
  },
  "api:/openapi/v2/alibaba/wan-2.7/image-edit-pro": {
    sizes: [{"value":"1024x1024","label":"1K"},{"value":"1536x1024","label":"1K"},{"value":"1024x1536","label":"1K"},{"value":"1536x1536","label":"1K"},{"value":"2048x2048","label":"2K"}],
  },
  "api:/openapi/v2/kling-v3.0-std/text-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-v3.0-pro/text-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-v3-4k/text-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-video-o3-std/text-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-video-o3-pro/text-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-video-o3-4k/text-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-v3.0-std/image-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-v3.0-pro/image-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-v3-4k/image-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-video-o3-std/image-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-video-o3-pro/image-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-video-o3-4k/image-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-video-o3-std/reference-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-video-o3-pro/reference-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-video-o3-4k/reference-to-video": {
    sizes: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/kling-v3.0-std/motion-control": {
  },
  "api:/openapi/v2/kling-v3.0-pro/motion-control": {
  },
  "api:/openapi/v2/kling-video-o3-std/video-edit": {
  },
  "api:/openapi/v2/kling-video-o3-pro/video-edit": {
  },
  "api:/openapi/v2/alibaba/wan-2.7/text-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"}],
    resolutions: [{"value":"720P","label":"720P"},{"value":"1080P","label":"1080P"}],
    durations: [{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/alibaba/wan-2.7/image-to-video": {
    resolutions: [{"value":"720P","label":"720P"},{"value":"1080P","label":"1080P"}],
    durations: [{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/alibaba/wan-2.7/reference-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"}],
    resolutions: [{"value":"720P","label":"720P"},{"value":"1080P","label":"1080P"}],
    durations: [{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/alibaba/wan-2.7/video-edit": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"}],
    resolutions: [{"value":"720P","label":"720P"},{"value":"1080P","label":"1080P"}],
    durations: [{"value":"0","label":"0s"},{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/alibaba/wan-2.7/video-extend": {
    resolutions: [{"value":"720P","label":"720P"},{"value":"1080P","label":"1080P"}],
    durations: [{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/alibaba/wan-2.7-spicy/image-to-video": {
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/pixverse-v6/text-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"4:3","label":"4:3"},{"value":"1:1","label":"1:1"},{"value":"3:4","label":"3:4"},{"value":"9:16","label":"9:16"},{"value":"2:3","label":"2:3"},{"value":"3:2","label":"3:2"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"360p","label":"360p"},{"value":"540p","label":"540p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"1","label":"1s"},{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/pixverse-v6/image-to-video": {
    resolutions: [{"value":"360p","label":"360p"},{"value":"540p","label":"540p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"1","label":"1s"},{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/pixverse-v6/transition": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"4:3","label":"4:3"},{"value":"1:1","label":"1:1"},{"value":"3:4","label":"3:4"},{"value":"9:16","label":"9:16"},{"value":"2:3","label":"2:3"},{"value":"3:2","label":"3:2"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"360p","label":"360p"},{"value":"540p","label":"540p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"1","label":"1s"},{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/pixverse-v6/effects": {
    resolutions: [{"value":"360p","label":"360p"},{"value":"540p","label":"540p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"1","label":"1s"},{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/pixverse-v6/extend": {
    resolutions: [{"value":"360p","label":"360p"},{"value":"540p","label":"540p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"1","label":"1s"},{"value":"2","label":"2s"},{"value":"3","label":"3s"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/hailuo-02/t2v-pro": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"}],
  },
  "api:/openapi/v2/minimax/hailuo-2.3/t2v-standard": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/minimax/hailuo-2.3/t2v-pro": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"}],
  },
  "api:/openapi/v2/minimax/hailuo-02/i2v-pro": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"}],
  },
  "api:/openapi/v2/minimax/hailuo-2.3/i2v-standard": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/minimax/hailuo-2.3/image-to-video-pro": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"}],
  },
  "api:/openapi/v2/minimax/hailuo-2.3-fast/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/minimax/hailuo-2.3-fast-pro/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"}],
  },
  "api:/openapi/v2/minimax/hailuo-02/fast": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/minimax/nova-video-2.0/text-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/nova-video-2.0-fast/text-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/eva-video-2.0/text-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/eva-video-2.0-fast/text-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/nova-video-2.0/image-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/nova-video-2.0-fast/image-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/eva-video-2.0/image-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/eva-video-2.0-fast/image-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/nova-video-2.0/multimodal-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/nova-video-2.0-fast/multimodal-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/eva-video-2.0/multimodal-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/minimax/eva-video-2.0-fast/multimodal-to-video": {
    sizes: [{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"1:1","label":"1:1"},{"value":"21:9","label":"21:9"},{"value":"adaptive","label":"adaptive"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/rhart-audio/text-to-audio/speech-2.8-hd": {
    presets: [{"value":"mp3","label":"mp3"}],
  },
  "api:/openapi/v2/rhart-audio/text-to-audio/speech-02-hd": {
    presets: [{"value":"mp3","label":"mp3"}],
  },
  "api:/openapi/v2/rhart-audio/text-to-audio/speech-2.8-turbo": {
    presets: [{"value":"mp3","label":"mp3"}],
  },
  "api:/openapi/v2/rhart-audio/text-to-audio/speech-02-turbo": {
    presets: [{"value":"mp3","label":"mp3"}],
  },
  "api:/openapi/v2/rhart-audio/text-to-audio/speech-2.6-hd": {
    presets: [{"value":"mp3","label":"mp3"}],
  },
  "api:/openapi/v2/rhart-audio/text-to-audio/speech-2.6-turbo": {
    presets: [{"value":"mp3","label":"mp3"}],
  },
  "api:/openapi/v2/rhart-audio/text-to-audio/voice-clone": {
    presets: [{"value":"mp3","label":"mp3"}],
  },
  "api:/openapi/v2/minimax/voice-design": {
    presets: [{"value":"mp3","label":"mp3"}],
  },
  "api:/openapi/v2/rhart-audio/text-to-audio/music-2.5": {
    presets: [{"value":"mp3","label":"mp3"}],
  },
  "api:/openapi/v2/minimax/music-2.6/text-to-music": {
    presets: [{"value":"mp3","label":"mp3"},{"value":"wav","label":"wav"},{"value":"pcm","label":"pcm"}],
  },
  "api:/openapi/v2/minimax/music-2.6/text-to-instrumental": {
    presets: [{"value":"mp3","label":"mp3"},{"value":"wav","label":"wav"},{"value":"pcm","label":"pcm"}],
  },
  "api:/openapi/v2/minimax/hailuo-02/standard": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/minimax/hailuo-02/t2v-standard": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/minimax/hailuo-02/pro": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/minimax/hailuo-02/i2v-standard": {
    sizes: [{"value":"auto","label":"Auto"}],
    durations: [{"value":"6","label":"6s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/seedream-v5-lite/text-to-image": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"2k","label":"2K"},{"value":"3k","label":"3K"}],
  },
  "api:/openapi/v2/bytedance/jimeng-4.6/text-to-image": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"1024x1024","label":"1K"},{"value":"1536x1024","label":"1K"},{"value":"1024x1536","label":"1K"},{"value":"1536x1536","label":"1K"},{"value":"2048x2048","label":"2K"}],
  },
  "api:/openapi/v2/rhart-image-g/text-to-image": {
    sizes: [{"value":"960x960","label":"1K"},{"value":"720x1280","label":"720p"},{"value":"1280x720","label":"720p"},{"value":"1168x784","label":"784p"},{"value":"784x1168","label":"784p"}],
  },
  "api:/openapi/v2/rhart-image/z-image/turbo": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"}],
    sizes: [{"value":"auto","label":"Auto"},{"value":"1024x1024","label":"1K"},{"value":"1280x720","label":"720p"},{"value":"720x1280","label":"720p"},{"value":"1536x1024","label":"1K"},{"value":"1024x1536","label":"1K"},{"value":"1536x1536","label":"1K"},{"value":"2048x2048","label":"2K"},{"value":"custom","label":"自定义尺寸"}],
  },
  "api:/openapi/v2/rhart-image/f-2-dev/text-to-image": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"1024x1024","label":"1K"},{"value":"1280x720","label":"720p"},{"value":"720x1280","label":"720p"},{"value":"1536x1024","label":"1K"},{"value":"1024x1536","label":"1K"},{"value":"1536x1536","label":"1K"},{"value":"2048x2048","label":"2K"},{"value":"custom","label":"自定义尺寸"}],
  },
  "api:/openapi/v2/seedance-v1.5-pro/text-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"}],
  },
  "api:/openapi/v2/seedance-v1.5-pro/text-to-video-fast": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"}],
  },
  "api:/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/bytedance/seedance-2.0-global/text-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"native1080p","label":"native1080p"},{"value":"1080p","label":"1080p"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/gemini-omni-flash/text-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"4","label":"4s"},{"value":"6","label":"6s"},{"value":"8","label":"8s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/rhart-image-n-g31-flash/text-to-image": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"},{"value":"1:4","label":"1:4"},{"value":"4:1","label":"4:1"},{"value":"1:8","label":"1:8"},{"value":"8:1","label":"8:1"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-n-g31-flash-official/text-to-image": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"},{"value":"1:4","label":"1:4"},{"value":"4:1","label":"4:1"},{"value":"1:8","label":"1:8"},{"value":"8:1","label":"8:1"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-n-pro/text-to-image": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-n-pro-official/text-to-image": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-n-pro-official/text-to-image-ultra": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"}],
    sizes: [{"value":"4k","label":"4K"},{"value":"8k","label":"8K"}],
  },
  "api:/openapi/v2/rhart-video-g/text-to-video": {
    sizes: [{"value":"2:3","label":"2:3"},{"value":"3:2","label":"3:2"},{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"480p","label":"480p"}],
    durations: [{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"},{"value":"16","label":"16s"},{"value":"17","label":"17s"},{"value":"18","label":"18s"},{"value":"19","label":"19s"},{"value":"20","label":"20s"},{"value":"21","label":"21s"},{"value":"22","label":"22s"},{"value":"23","label":"23s"},{"value":"24","label":"24s"},{"value":"25","label":"25s"},{"value":"26","label":"26s"},{"value":"27","label":"27s"},{"value":"28","label":"28s"},{"value":"29","label":"29s"},{"value":"30","label":"30s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-fast/text-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"4","label":"4s"},{"value":"6","label":"6s"},{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-pro/text-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-pro-official/text-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"4","label":"4s"},{"value":"6","label":"6s"},{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-lite-official/text-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"4","label":"4s"},{"value":"6","label":"6s"},{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-image-g-2/text-to-image": {
    aspectRatios: [{"value":"empty","label":"Auto"},{"value":"3:2","label":"3:2"},{"value":"1:1","label":"1:1"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"21:9","label":"21:9"},{"value":"3:4","label":"3:4"},{"value":"4:3","label":"4:3"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-g-2-official/text-to-image": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"1:2","label":"1:2"},{"value":"2:1","label":"2:1"},{"value":"1:3","label":"1:3"},{"value":"3:1","label":"3:1"},{"value":"2:3","label":"2:3"},{"value":"3:2","label":"3:2"},{"value":"3:4","label":"3:4"},{"value":"4:3","label":"4:3"},{"value":"4:5","label":"4:5"},{"value":"5:4","label":"5:4"},{"value":"9:16","label":"9:16"},{"value":"21:9","label":"21:9"},{"value":"9:21","label":"9:21"},{"value":"16:9","label":"16:9"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
    qualityLevels: [{"value":"low","label":"low"},{"value":"medium","label":"medium"},{"value":"high","label":"high"}],
  },
  "api:/openapi/v2/youchuan/text-to-image-v7": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:2","label":"3:2"},{"value":"16:9","label":"16:9"},{"value":"3:4","label":"3:4"},{"value":"2:3","label":"2:3"},{"value":"9:16","label":"9:16"}],
    sizes: [{"value":"auto","label":"Auto"}],
    qualityLevels: [{"value":"1","label":"Quality 1"},{"value":"2","label":"Quality 2"},{"value":"4","label":"Quality 4"}],
  },
  "api:/openapi/v2/youchuan/text-to-image-v81": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:2","label":"3:2"},{"value":"16:9","label":"16:9"},{"value":"3:4","label":"3:4"},{"value":"2:3","label":"2:3"},{"value":"9:16","label":"9:16"}],
    sizes: [{"value":"auto","label":"Auto"}],
    qualityLevels: [{"value":"1","label":"Quality 1"},{"value":"4","label":"Quality 4"}],
  },
  "api:/openapi/v2/seedream-v5-lite/image-to-image": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"2k","label":"2K"},{"value":"3k","label":"3K"}],
  },
  "api:/openapi/v2/bytedance/jimeng-4.6/image-to-image": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"1024x1024","label":"1K"},{"value":"1536x1024","label":"1K"},{"value":"1024x1536","label":"1K"},{"value":"1536x1536","label":"1K"},{"value":"2048x2048","label":"2K"}],
  },
  "api:/openapi/v2/rhart-image-g/image-to-image": {
    sizes: [{"value":"960x960","label":"1K"},{"value":"720x1280","label":"720p"},{"value":"1280x720","label":"720p"},{"value":"1168x784","label":"784p"},{"value":"784x1168","label":"784p"}],
  },
  "api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/bytedance/seedance-2.0-global/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"native1080p","label":"native1080p"},{"value":"1080p","label":"1080p"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/bytedance/seedance-2.0-global/multimodal-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"21:9","label":"21:9"}],
    resolutions: [{"value":"480p","label":"480p"},{"value":"720p","label":"720p"},{"value":"native1080p","label":"native1080p"},{"value":"1080p","label":"1080p"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
    durations: [{"value":"-1","label":"-1"},{"value":"4","label":"4s"},{"value":"5","label":"5s"},{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"}],
  },
  "api:/openapi/v2/gemini-omni-flash/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"4","label":"4s"},{"value":"6","label":"6s"},{"value":"8","label":"8s"},{"value":"10","label":"10s"}],
  },
  "api:/openapi/v2/gemini-omni-flash/video-edit": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-n-g31-flash/image-to-image": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"},{"value":"1:4","label":"1:4"},{"value":"4:1","label":"4:1"},{"value":"1:8","label":"1:8"},{"value":"8:1","label":"8:1"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-n-g31-flash-official/image-to-image": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"},{"value":"1:4","label":"1:4"},{"value":"4:1","label":"4:1"},{"value":"1:8","label":"1:8"},{"value":"8:1","label":"8:1"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-n-pro/edit": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-n-pro-official/edit": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-n-pro-official/edit-ultra": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"4:3","label":"4:3"},{"value":"3:4","label":"3:4"},{"value":"3:2","label":"3:2"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"21:9","label":"21:9"}],
    sizes: [{"value":"4k","label":"4K"},{"value":"8k","label":"8K"}],
  },
  "api:/openapi/v2/rhart-video-g/image-to-video": {
    sizes: [{"value":"2:3","label":"2:3"},{"value":"3:2","label":"3:2"},{"value":"1:1","label":"1:1"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"480p","label":"480p"}],
    durations: [{"value":"6","label":"6s"},{"value":"7","label":"7s"},{"value":"8","label":"8s"},{"value":"9","label":"9s"},{"value":"10","label":"10s"},{"value":"11","label":"11s"},{"value":"12","label":"12s"},{"value":"13","label":"13s"},{"value":"14","label":"14s"},{"value":"15","label":"15s"},{"value":"16","label":"16s"},{"value":"17","label":"17s"},{"value":"18","label":"18s"},{"value":"19","label":"19s"},{"value":"20","label":"20s"},{"value":"21","label":"21s"},{"value":"22","label":"22s"},{"value":"23","label":"23s"},{"value":"24","label":"24s"},{"value":"25","label":"25s"},{"value":"26","label":"26s"},{"value":"27","label":"27s"},{"value":"28","label":"28s"},{"value":"29","label":"29s"},{"value":"30","label":"30s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-fast/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-fast/start-end-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-fast-official/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"4","label":"4s"},{"value":"6","label":"6s"},{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-fast-official/reference-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-pro/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    durations: [{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-pro/start-end-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-pro-official/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
    durations: [{"value":"4","label":"4s"},{"value":"6","label":"6s"},{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-pro-official/reference-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-lite-official/image-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
    durations: [{"value":"4","label":"4s"},{"value":"6","label":"6s"},{"value":"8","label":"8s"}],
  },
  "api:/openapi/v2/rhart-video-v3.1-lite-official/start-end-to-video": {
    sizes: [{"value":"auto","label":"Auto"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"}],
    resolutions: [{"value":"720p","label":"720p"},{"value":"1080p","label":"1080p"}],
  },
  "api:/openapi/v2/rhart-image-g-2/image-to-image": {
    aspectRatios: [{"value":"empty","label":"Auto"},{"value":"3:2","label":"3:2"},{"value":"1:1","label":"1:1"},{"value":"2:3","label":"2:3"},{"value":"5:4","label":"5:4"},{"value":"4:5","label":"4:5"},{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"21:9","label":"21:9"},{"value":"3:4","label":"3:4"},{"value":"4:3","label":"4:3"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
  },
  "api:/openapi/v2/rhart-image-g-2-official/image-to-image": {
    aspectRatios: [{"value":"1:1","label":"1:1"},{"value":"1:2","label":"1:2"},{"value":"2:1","label":"2:1"},{"value":"1:3","label":"1:3"},{"value":"3:1","label":"3:1"},{"value":"2:3","label":"2:3"},{"value":"3:2","label":"3:2"},{"value":"3:4","label":"3:4"},{"value":"4:3","label":"4:3"},{"value":"4:5","label":"4:5"},{"value":"5:4","label":"5:4"},{"value":"9:16","label":"9:16"},{"value":"21:9","label":"21:9"},{"value":"9:21","label":"9:21"},{"value":"16:9","label":"16:9"}],
    sizes: [{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}],
    qualityLevels: [{"value":"low","label":"low"},{"value":"medium","label":"medium"},{"value":"high","label":"high"}],
  },
} satisfies Record<string, RunningHubStandardOptionProfile>;
