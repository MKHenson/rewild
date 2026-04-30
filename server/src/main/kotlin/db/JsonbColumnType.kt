package com.rewild.db

import org.jetbrains.exposed.sql.Column
import org.jetbrains.exposed.sql.ColumnType
import org.jetbrains.exposed.sql.Table
import org.postgresql.util.PGobject

class JsonbColumnType : ColumnType<String>() {
    override fun sqlType() = "JSONB"

    override fun valueFromDB(value: Any): String = when (value) {
        is PGobject -> value.value ?: "{}"
        else -> value.toString()
    }

    override fun notNullValueToDB(value: String): Any = PGobject().apply {
        type = "jsonb"
        this.value = value
    }
}

fun Table.jsonb(name: String): Column<String> = registerColumn(name, JsonbColumnType())
