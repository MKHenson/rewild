package com.rewild.email

import jakarta.mail.Authenticator
import jakarta.mail.Message
import jakarta.mail.PasswordAuthentication
import jakarta.mail.Session
import jakarta.mail.Transport
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import org.slf4j.LoggerFactory
import java.util.Properties

class EmailService(
    private val host: String,
    private val port: Int,
    private val username: String,
    private val password: String,
    private val from: String,
) {
    private val log = LoggerFactory.getLogger(EmailService::class.java)

    fun sendPasswordReset(toEmail: String, resetUrl: String) {
        val props = Properties().apply {
            put("mail.smtp.auth", "true")
            put("mail.smtp.ssl.enable", "true")
            put("mail.smtp.host", host)
            put("mail.smtp.port", port.toString())
        }

        val session = Session.getInstance(props, object : Authenticator() {
            override fun getPasswordAuthentication() = PasswordAuthentication(username, password)
        })

        val message = MimeMessage(session).apply {
            setFrom(InternetAddress(this@EmailService.from))
            setRecipients(Message.RecipientType.TO, InternetAddress.parse(toEmail))
            subject = "Reset your RE-WILD password"
            setText(
                """
                We received a request to reset the password for your RE-WILD account.

                Click the link below to set a new password (valid for 1 hour):

                $resetUrl

                If you didn't request this, you can safely ignore this email.

                — The RE-WILD team
                """.trimIndent()
            )
        }

        Transport.send(message)
        log.info("Password reset email sent to {}", toEmail)
    }
}
