package com.whstock.app.domain

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.whstock.app.ServiceLocator
import com.whstock.app.data.local.entities.OutboxEntity
import kotlinx.coroutines.flow.first

class SyncOutboxWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        val settingsStore = ServiceLocator.settingsStore(applicationContext)
        val settings = settingsStore.settingsFlow.first()
        if (settings.baseUrl.isBlank()) return Result.success()

        ServiceLocator.resetApi()
        val api = ServiceLocator.backendApi(settings)
        val db = ServiceLocator.appDatabase(applicationContext)
        val outbox = db.outboxDao().getAll()

        if (outbox.isEmpty()) return Result.success()

        var hasErrors = false

        for (item in outbox) {
            val document = db.documentDao().getById(item.documentId)
            if (document == null) {
                db.outboxDao().remove(item.documentId)
                continue
            }

            val body = mapOf(
                "type" to document.tab.uppercase(),
                "data" to mapOf(
                    "id" to document.id,
                    "name" to document.name,
                    "status" to document.status,
                    "createdAt" to document.createdAt
                )
            )

            val response = runCatching { api.postDocument(body) }.getOrNull()

            if (response?.isSuccessful == true) {
                db.outboxDao().remove(item.documentId)
                db.documentDao().updateSyncStatus(item.documentId, "sent", System.currentTimeMillis().toString())
                continue
            }

            hasErrors = true
            val updated = item.nextAttempt("HTTP ${response?.code() ?: "net"}")
            db.outboxDao().upsert(updated)
            db.documentDao().updateSyncStatus(item.documentId, "error", null)
        }

        return if (hasErrors) Result.retry() else Result.success()
    }
}

private fun OutboxEntity.nextAttempt(error: String): OutboxEntity {
    return copy(
        attempts = attempts + 1,
        lastError = error,
        lastAttemptAt = System.currentTimeMillis().toString()
    )
}
