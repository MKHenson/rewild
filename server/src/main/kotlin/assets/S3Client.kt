package com.rewild.assets

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest
import java.net.URI
import java.time.Duration

class S3Client(
    endpoint: String,
    accessKey: String,
    secretKey: String,
    region: String = "fr-par"
) {
    private val presigner: S3Presigner = S3Presigner.builder()
        .endpointOverride(URI.create(endpoint))
        .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
        .region(Region.of(region))
        // MinIO and Scaleway both require path-style access
        .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
        .build()

    fun presignPut(bucket: String, key: String, ttlMinutes: Long = 15): String {
        val putRequest = PutObjectRequest.builder().bucket(bucket).key(key).build()
        val presignRequest = PutObjectPresignRequest.builder()
            .signatureDuration(Duration.ofMinutes(ttlMinutes))
            .putObjectRequest(putRequest)
            .build()
        return presigner.presignPutObject(presignRequest).url().toString()
    }
}
