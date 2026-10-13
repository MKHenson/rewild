package com.rewild.assets

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.model.Delete
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.ObjectIdentifier
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest
import java.net.URI
import java.time.Duration
import software.amazon.awssdk.services.s3.S3Client as AwsS3Client

interface S3Signer {
    // A non-null contentType is signed, so the upload must send that Content-Type.
    fun presignPut(bucket: String, key: String, ttlMinutes: Long = 15, contentType: String? = null): String
}

data class ObjectHead(val size: Long, val contentType: String?)

interface S3Inspector {
    // Returns null when the object does not exist.
    fun head(bucket: String, key: String): ObjectHead?
}

interface S3Deleter {
    // Deletes every object under `prefix`. Returns the number deleted. Throws on failure.
    fun deletePrefix(bucket: String, prefix: String): Int
}

class S3Client(
    endpoint: String, 
    accessKey: String, 
    secretKey: String,
    region: String = "fr-par"
) : S3Signer, S3Deleter, S3Inspector {
    private val presigner: S3Presigner
    private val client: AwsS3Client

    init {
        // AWS SDK v2 can't parse the AWS CLI v2 nested format (s3 = \n  key = value)
        // in ~/.aws/config. Since we configure everything programmatically, redirect
        // to a nonexistent path so the SDK silently skips loading any profile file.
        System.setProperty("aws.configFile", "nonexistent-aws-config")
        val credentials = StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey))
        // MinIO and Scaleway both require path-style access
        val serviceConfig = S3Configuration.builder().pathStyleAccessEnabled(true).build()

        presigner = S3Presigner.builder()
            .endpointOverride(URI.create(endpoint))
            .credentialsProvider(credentials)
            .region(Region.of(region))
            .serviceConfiguration(serviceConfig)
            .build()

        client = AwsS3Client.builder()
            .endpointOverride(URI.create(endpoint))
            .credentialsProvider(credentials)
            .region(Region.of(region))
            .serviceConfiguration(serviceConfig)
            .build()
    }

    override fun presignPut(bucket: String, key: String, ttlMinutes: Long, contentType: String?): String {
        val putRequest = PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build()
        val presignRequest = PutObjectPresignRequest.builder()
            .signatureDuration(Duration.ofMinutes(ttlMinutes))
            .putObjectRequest(putRequest)
            .build()
        return presigner.presignPutObject(presignRequest).url().toString()
    }

    override fun head(bucket: String, key: String): ObjectHead? = try {
        val response = client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
        ObjectHead(size = response.contentLength(), contentType = response.contentType())
    } catch (e: NoSuchKeyException) {
        null
    } catch (e: S3Exception) {
        if (e.statusCode() == 404) null else throw e
    }

    // S3 has no prefix delete, despite what the name suggests: list the prefix, then
    // batch-delete each page. ListObjectsV2 caps a page at 1000 keys, which is also
    // DeleteObjects' per-request cap, so a page maps 1:1 onto a delete batch.
    override fun deletePrefix(bucket: String, prefix: String): Int {
        var deleted = 0
        var continuationToken: String? = null

        do {
            val listResponse = client.listObjectsV2(
                ListObjectsV2Request.builder()
                    .bucket(bucket)
                    .prefix(prefix)
                    .continuationToken(continuationToken)
                    .build()
            )

            val keys = listResponse.contents().map { ObjectIdentifier.builder().key(it.key()).build() }
            if (keys.isNotEmpty()) {
                val deleteResponse = client.deleteObjects(
                    DeleteObjectsRequest.builder()
                        .bucket(bucket)
                        .delete(Delete.builder().objects(keys).build())
                        .build()
                )
                // DeleteObjects reports per-key failures in the body rather than as an
                // exception, so a partial failure must be surfaced by hand.
                if (deleteResponse.hasErrors() && deleteResponse.errors().isNotEmpty()) {
                    val first = deleteResponse.errors().first()
                    throw IllegalStateException(
                        "Failed to delete ${deleteResponse.errors().size} object(s) under $prefix; " +
                            "first: ${first.key()} (${first.code()}: ${first.message()})"
                    )
                }
                deleted += deleteResponse.deleted().size
            }

            continuationToken = listResponse.nextContinuationToken()
        } while (listResponse.isTruncated == true)

        return deleted
    }
}
