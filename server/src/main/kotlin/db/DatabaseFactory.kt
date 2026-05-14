package com.rewild.db

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.server.application.*
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.sql.Database
object DatabaseFactory {
    fun init(application: Application) {
        val config = application.environment.config
        val url = config.property("database.url").getString()
        val user = config.property("database.user").getString()
        val password = config.property("database.password").getString()

        Flyway.configure()
            .dataSource(url, user, password)
            .locations("classpath:db/migration")
            .validateMigrationNaming(true)
            .load()
            .migrate()

        val hikari = HikariConfig().apply {
            jdbcUrl = url
            username = user
            this.password = password
            driverClassName = "org.postgresql.Driver"
            maximumPoolSize = 10
        }
        Database.connect(HikariDataSource(hikari))
    }
}
