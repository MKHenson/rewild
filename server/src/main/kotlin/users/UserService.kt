package com.rewild.users

import com.rewild.db.tables.UsersTable
import com.rewild.models.UserSummary
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction

const val USER_SEARCH_MIN_LENGTH = 2
const val USER_SEARCH_LIMIT = 10

class UserService {

    /**
     * Users whose display name starts with [query], or whose email is exactly [query]. Both ignore case.
     * Leaves out [callerId]. A query shorter than [USER_SEARCH_MIN_LENGTH] matches nobody.
     */
    fun search(callerId: String, query: String): List<UserSummary> {
        val q = query.trim().lowercase()
        if (q.length < USER_SEARCH_MIN_LENGTH) return emptyList()
        val prefix = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

        return transaction {
            UsersTable.selectAll()
                .where {
                    ((UsersTable.displayName.lowerCase() like prefix) or (UsersTable.email.lowerCase() eq q)) and
                        (UsersTable.id neq callerId)
                }
                .orderBy(UsersTable.displayName.lowerCase() to SortOrder.ASC, UsersTable.id to SortOrder.ASC)
                .limit(USER_SEARCH_LIMIT)
                .map {
                    UserSummary(
                        id = it[UsersTable.id],
                        displayName = it[UsersTable.displayName],
                        photoUrl = it[UsersTable.photoUrl]
                    )
                }
        }
    }
}
