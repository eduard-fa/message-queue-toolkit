import { Readable } from 'node:stream'

import { S3 } from '@aws-sdk/client-s3'
import { describe, beforeEach, expect, it, beforeAll } from 'vitest'

import { S3PayloadStore } from '../../lib/S3PayloadStore'
import { assertEmptyBucket, getObjectContent, objectExists } from '../utils/s3Utils'
import { streamToString } from '../utils/streamUtils'
import { TEST_AWS_CONFIG } from '../utils/testS3Config'

const TEST_BUCKET = 'test-bucket'

describe('S3PayloadStore', () => {
  let s3: S3
  let store: S3PayloadStore

  beforeAll(async () => {
    s3 = new S3(TEST_AWS_CONFIG)
    store = new S3PayloadStore({ s3 }, { bucketName: TEST_BUCKET })
  })
  beforeEach(async () => {
    await assertEmptyBucket(s3, TEST_BUCKET)
  })

  describe('storePayload', () => {
    it('stores the payload in the bucket', async () => {
      const payload = 'test'

      const stringPayloadKey = await store.storePayload({
        value: payload,
        size: payload.length,
      })

      const streamPayloadKey = await store.storePayload({
        value: Readable.from(payload),
        size: payload.length,
      })
      expect(await getObjectContent(s3, TEST_BUCKET, stringPayloadKey)).toBe(payload)
      expect(await getObjectContent(s3, TEST_BUCKET, streamPayloadKey)).toBe(payload)
    })
    it('uses key prefix if provided', async () => {
      const store = new S3PayloadStore({ s3 }, { bucketName: TEST_BUCKET, keyPrefix: 'prefix' })
      const payload = 'test'
      const stringPayloadKey = await store.storePayload({
        value: payload,
        size: payload.length,
      })

      expect(stringPayloadKey).toContain('prefix/')
    })
  })
  describe('retrievePayload', () => {
    it('retrieves previously stored payload', async () => {
      const payload = 'test'
      const key = await store.storePayload({
        value: Readable.from(payload),
        size: payload.length,
      })

      const result = await store.retrievePayload(key)

      expect(result).toBeInstanceOf(Readable)
      await expect(streamToString(result!)).resolves.toBe(payload)
    })
    it('returns null if payload cannot be found', async () => {
      const result = await store.retrievePayload('non-existing-key')
      expect(result).toBe(null)
    })
    it('throws, if other than not-found error occurs', async () => {
      const store = new S3PayloadStore({ s3 }, { bucketName: 'non-existing-bucket' })
      await expect(store.retrievePayload('non-existing-key')).rejects.toThrow()
    })
  })
  describe('deletePayload', () => {
    it('successfully deletes previously stored payload', async () => {
      const payload = 'test'
      const key = await store.storePayload({
        value: Readable.from(payload),
        size: payload.length,
      })
      await expect(objectExists(s3, TEST_BUCKET, key)).resolves.toBeTruthy()

      await store.deletePayload(key)

      await expect(objectExists(s3, TEST_BUCKET, key)).resolves.toBeFalsy()
    })
    it('gracefully handles non-existing key', async () => {
      await expect(store.deletePayload('non-existing-key')).resolves.not.toThrow()
    })
  })
})
