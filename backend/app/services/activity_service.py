from app.models.activity import ActivityLog


def log_activity(db, *, user_id=None, action: str, entity_type: str, entity_id=None, description: str | None = None, metadata: dict | None = None):
    db.add(ActivityLog(user_id=user_id, action=action, entity_type=entity_type,
        entity_id=entity_id, description=description, metadata_=metadata))
