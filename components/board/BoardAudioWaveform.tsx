"use client";

import AudioWaveformPreview from "@/components/audio/AudioWaveformPreview";

interface BoardAudioWaveformProps {
  src: string;
  interactive?: boolean;
}

export default function BoardAudioWaveform({ src, interactive = true }: BoardAudioWaveformProps) {
  return <AudioWaveformPreview src={src} interactive={interactive} size="full" />;
}
