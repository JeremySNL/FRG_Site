import { describe, expect, it } from 'vitest';
import { normalizeYouTubeVideo, parseYouTubeUrl } from '../src/lib/youtube.ts';

describe('parseYouTubeUrl', () => {
  it('extracts ids from watch URLs', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=xFp8-2GVoH8')).toEqual({
      id: 'xFp8-2GVoH8',
      aspect: 'landscape',
    });
  });

  it('extracts ids from shortened youtu.be URLs', () => {
    expect(parseYouTubeUrl('https://youtu.be/xFp8-2GVoH8')).toEqual({
      id: 'xFp8-2GVoH8',
      aspect: 'landscape',
    });
  });

  it('extracts ids from embed URLs', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/embed/xFp8-2GVoH8')).toEqual({
      id: 'xFp8-2GVoH8',
      aspect: 'landscape',
    });
  });

  it('extracts ids from live URLs', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/live/xFp8-2GVoH8')).toEqual({
      id: 'xFp8-2GVoH8',
      aspect: 'landscape',
    });
  });

  it('marks shorts as vertical', () => {
    expect(
      parseYouTubeUrl('https://youtube.com/shorts/ds5RyTGLvtQ?si=abc123'),
    ).toEqual({
      id: 'ds5RyTGLvtQ',
      aspect: 'vertical',
    });
  });

  it('accepts a raw id as landscape', () => {
    expect(parseYouTubeUrl('xFp8-2GVoH8')).toEqual({
      id: 'xFp8-2GVoH8',
      aspect: 'landscape',
    });
  });

  it('returns null for non-YouTube strings', () => {
    expect(parseYouTubeUrl('not a youtube url')).toBeNull();
    expect(parseYouTubeUrl('')).toBeNull();
  });
});

describe('normalizeYouTubeVideo', () => {
  it('prefers youtubeId when both are present', () => {
    expect(
      normalizeYouTubeVideo({
        youtubeId: 'abcDEF12345',
        url: 'https://youtube.com/shorts/xyzABC98765',
      }),
    ).toEqual({ id: 'abcDEF12345', aspect: 'landscape' });
  });

  it('derives vertical aspect from a shorts URL', () => {
    expect(normalizeYouTubeVideo({ url: 'https://youtube.com/shorts/xyzABC98765' })).toEqual({
      id: 'xyzABC98765',
      aspect: 'vertical',
    });
  });

  it('lets aspect override derived value', () => {
    expect(
      normalizeYouTubeVideo({
        url: 'https://youtube.com/shorts/xyzABC98765',
        aspect: 'landscape',
      }),
    ).toEqual({ id: 'xyzABC98765', aspect: 'landscape' });
  });

  it('returns null when no usable source is given', () => {
    expect(normalizeYouTubeVideo({})).toBeNull();
    expect(normalizeYouTubeVideo({ url: 'clearly not a youtube url' })).toBeNull();
  });
});
