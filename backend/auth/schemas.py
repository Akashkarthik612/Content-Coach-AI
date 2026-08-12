from pydantic import BaseModel


class AvailabilityResponse(BaseModel):
    username_available: bool
    email_available: bool
