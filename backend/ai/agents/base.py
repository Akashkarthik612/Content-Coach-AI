from abc import ABC, abstractmethod


class BaseResearcher(ABC):
    """
    Contract every platform researcher must satisfy.
    Given a topic query, research it and return that platform's result
    (e.g. angles for a post).

    Current:  (none yet — researcher_linkedin is a standalone function)
    Future:   LinkedInResearcher, RedditResearcher, XResearcher, MediumResearcher
    """

    @abstractmethod
    async def research(self, query: str) -> dict:
        pass
